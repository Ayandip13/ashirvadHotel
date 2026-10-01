import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'
import { DB_STATEMENTS } from '@/lib/db-init-sql'

/**
 * Runtime DB bootstrap for serverless (Vercel):
 * - SQLite file must live in a writable location (/tmp on Vercel).
 * - We copy the bundled, pre-seeded DB file into /tmp on first use.
 * - If the bundled file is missing, we recreate the schema + seed data
 *   from generated SQL statements (db-init-sql.ts).
 * - Schema version suffix ensures a fresh DB after schema-changing redeploys.
 */
const SCHEMA_VERSION = 'v1'
const RUNTIME_DB_PATH = `/tmp/hotel-manager-${SCHEMA_VERSION}.db`

const CANDIDATE_BUNDLED_PATHS = [
  path.join(process.cwd(), 'db', 'custom.db'),
  path.join(process.cwd(), '..', 'db', 'custom.db'),
  path.join(process.cwd(), '.next', 'standalone', 'db', 'custom.db'),
]

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

async function createFromSqlStatements(dbFile: string) {
  fs.writeFileSync(dbFile, '')
  const bootstrap = new PrismaClient({
    datasources: { db: { url: `file:${dbFile}` } },
  })
  for (const stmt of DB_STATEMENTS) {
    await bootstrap.$executeRawUnsafe(stmt)
  }
  await bootstrap.$disconnect()
}

export async function ensureRuntimeDb(): Promise<string> {
  if (process.env.HOTEL_DB_PATH) {
    // Explicit override (e.g. external libsql/turso style URLs) — use as-is
    return process.env.HOTEL_DB_PATH
  }
  if (process.env.VERCEL === '1' || process.env.VERCEL) {
    if (!fs.existsSync(RUNTIME_DB_PATH) || fs.statSync(RUNTIME_DB_PATH).size === 0) {
      const bundled = findBundledDb()
      if (bundled) {
        fs.copyFileSync(bundled, RUNTIME_DB_PATH)
      } else {
        await createFromSqlStatements(RUNTIME_DB_PATH)
      }
    }
    return RUNTIME_DB_PATH
  }
  // Local dev: use DATABASE_URL from .env as-is
  return ''
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  prismaReady: Promise<string> | undefined
}

export function getDbUrl(): Promise<string> {
  if (!globalForPrisma.prismaReady) {
    globalForPrisma.prismaReady = ensureRuntimeDb()
  }
  return globalForPrisma.prismaReady
}

// Initialize once at module load (before first query)
const initPromise = getDbUrl()

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Ensure initialization completes before any query runs.
// Prisma lazily connects, so we simply await the init in a fire-and-forget
// manner here; each request handler also awaits it via withDb().
export const dbReady = initPromise
