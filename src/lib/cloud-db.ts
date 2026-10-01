import fs from 'fs'
import path from 'path'
import os from 'os'
import { put, head, get } from '@vercel/blob'
import { PrismaClient } from '@prisma/client'
import { DB_STATEMENTS } from '@/lib/db-init-sql'
import { migrateDb } from '@/lib/db-migrate'

/**
 * Shared cloud database for serverless (Vercel):
 *
 * SQLite database file is stored in Vercel Blob. Every request:
 *   1. (mutex) serializes access per instance
 *   2. HEADs the blob to get the latest version (etag)
 *   3. If changed, downloads the file to /tmp and creates a PrismaClient
 *      bound to that exact file version
 *   4. Handler runs against the client
 *   5. Mutations upload the file back to Blob
 *
 * This keeps every serverless instance consistent with the latest data.
 * Local development (no BLOB_READ_WRITE_TOKEN) uses the local SQLite file.
 */

const DB_BLOB_PATH = 'hotel-manager.db'
const SCHEMA_VERSION = 'v2'

const CANDIDATE_BUNDLED_PATHS = [
  path.join(process.cwd(), 'db', 'custom.db'),
  path.join(process.cwd(), '..', 'db', 'custom.db'),
  path.join(process.cwd(), '.next', 'standalone', 'db', 'custom.db'),
]

interface CacheEntry {
  version: string
  file: string
  client: PrismaClient
}

const globalState = globalThis as unknown as {
  hotelQueue: Promise<unknown> | undefined
  hotelCache: CacheEntry | null
  hotelLocalClient: PrismaClient | undefined
}

function withMutex<T>(fn: () => Promise<T>): Promise<T> {
  const prev = globalState.hotelQueue || Promise.resolve()
  const result = prev.then(fn, fn)
  globalState.hotelQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

function findBundledDb(): string | null {
  for (const p of CANDIDATE_BUNDLED_PATHS) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).size > 0) return p
    } catch {
      // ignore
    }
  }
  return null
}

async function createFreshDbBuffer(): Promise<Buffer> {
  const tmpFile = path.join(os.tmpdir(), `hotel-init-${Date.now()}.db`)
  fs.writeFileSync(tmpFile, '')
  const client = new PrismaClient({
    datasources: { db: { url: `file:${tmpFile}` } },
  })
  for (const stmt of DB_STATEMENTS) {
    await client.$executeRawUnsafe(stmt)
  }
  const buf = fs.readFileSync(tmpFile)
  await client.$disconnect()
  try {
    fs.unlinkSync(tmpFile)
  } catch {
    // ignore
  }
  return buf
}

async function ensureBlobExists(): Promise<string> {
  // Returns latest version string; uploads bundled DB if blob is empty.
  try {
    const meta = await head(DB_BLOB_PATH)
    return meta.etag || String(meta.uploadedAt)
  } catch {
    // Not found -> initialize
    const bundled = findBundledDb()
    let buf: Buffer
    if (bundled) {
      buf = fs.readFileSync(bundled)
    } else {
      buf = await createFreshDbBuffer()
    }
    await put(DB_BLOB_PATH, buf, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
    })
    const meta = await head(DB_BLOB_PATH)
    return meta.etag || String(meta.uploadedAt)
  }
}

async function downloadTo(version: string): Promise<{ file: string; client: PrismaClient }> {
  // useCache:false => fetch directly from origin storage (guaranteed latest).
  const result = await get(DB_BLOB_PATH, { access: 'private', useCache: false })
  if (!result || result.statusCode !== 200) {
    throw new Error('Database blob not found')
  }
  const reader = result.stream.getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)))
  const file = path.join(os.tmpdir(), `hotel-${SCHEMA_VERSION}-${version.replace(/[^a-zA-Z0-9]/g, '_')}.db`)
  fs.writeFileSync(file, buf)
  const client = new PrismaClient({
    datasources: { db: { url: `file:${file}` } },
  })
  // touch connection to validate file integrity
  await client.$queryRaw`SELECT 1`
  return { file, client }
}

export interface DbSession {
  client: PrismaClient
  /** call after mutations to persist to cloud */
  persist: () => Promise<void>
}

export async function acquireDb(): Promise<DbSession> {
  return withMutex(async () => {
    // Local dev: plain shared client
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      if (!globalState.hotelLocalClient) {
        globalState.hotelLocalClient = new PrismaClient()
        await migrateDb(globalState.hotelLocalClient)
      }
      return {
        client: globalState.hotelLocalClient,
        persist: async () => {},
      }
    }

    const version = await ensureBlobExists()
    const cache = globalState.hotelCache
    if (cache && cache.version === version) {
      return {
        client: cache.client,
        persist: async () => {
          await uploadFile(cache.file)
        },
      }
    }

    // Dispose stale cache
    if (cache) {
      try {
        await cache.client.$disconnect()
      } catch {
        // ignore
      }
      try {
        fs.unlinkSync(cache.file)
      } catch {
        // ignore
      }
    }

    const { file, client } = await downloadTo(version)
    // Upgrade an older shared DB in place (new tables/columns/seeds), then
    // persist the migrated version so every other instance gets it too.
    await migrateDb(client)
    await uploadFile(file)
    globalState.hotelCache = { version, file, client }
    return {
      client,
      persist: async () => {
        await uploadFile(file)
        // Sync cache version so the next request reuses this exact file
        try {
          const meta = await head(DB_BLOB_PATH)
          if (globalState.hotelCache && globalState.hotelCache.file === file) {
            globalState.hotelCache.version = meta.etag || String(meta.uploadedAt)
          }
        } catch {
          // ignore — next request will re-download
        }
      },
    }
  })
}

async function uploadFile(file: string) {
  const buf = fs.readFileSync(file)
  await put(DB_BLOB_PATH, buf, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
  })
}
