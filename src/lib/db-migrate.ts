import type { PrismaClient } from '@prisma/client'

/**
 * Idempotent schema migrations for the shared SQLite DB (local + Vercel Blob).
 * Every statement runs in try/catch — "duplicate column" / "already exists"
 * errors are expected and safely ignored. New deployments upgrade the existing
 * production DB in place without losing any data.
 */

const NEW_TABLES = [
  `CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'RECEPTION',
    "pin" TEXT NOT NULL DEFAULT '0000',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "User_name_key" ON "User"("name")`,
  `CREATE TABLE IF NOT EXISTS "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "ExpenseCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseCategory_name_key" ON "ExpenseCategory"("name")`,
  `CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT,
    "userName" TEXT,
    "userRole" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,
]

const NEW_COLUMNS = [
  `ALTER TABLE "Room" ADD COLUMN "housekeeping" TEXT NOT NULL DEFAULT 'CLEAN'`,
  `ALTER TABLE "Booking" ADD COLUMN "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID'`,
  `ALTER TABLE "Bill" ADD COLUMN "advanceApplied" REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE "Bill" ADD COLUMN "createdBy" TEXT`,
  `ALTER TABLE "Bill" ADD COLUMN "approvedBy" TEXT`,
  `ALTER TABLE "FoodOrder" ADD COLUMN "createdBy" TEXT`,
  `ALTER TABLE "StaffPayment" ADD COLUMN "method" TEXT NOT NULL DEFAULT 'CASH'`,
  `ALTER TABLE "StaffPayment" ADD COLUMN "recoveryNotes" TEXT`,
  `ALTER TABLE "LedgerEntry" ADD COLUMN "vendor" TEXT`,
]

const SEED_DATA = [
  `INSERT OR IGNORE INTO "User" ("id","name","role","pin","active","createdAt") VALUES ('user-admin','Admin','ADMIN','1111',1,CURRENT_TIMESTAMP)`,
  `INSERT OR IGNORE INTO "User" ("id","name","role","pin","active","createdAt") VALUES ('user-manager','Manager','MANAGER','2222',1,CURRENT_TIMESTAMP)`,
  `INSERT OR IGNORE INTO "User" ("id","name","role","pin","active","createdAt") VALUES ('user-reception','Reception','RECEPTION','3333',1,CURRENT_TIMESTAMP)`,
  `INSERT OR IGNORE INTO "Setting" ("key","value") VALUES ('hotelName','Grand Hotel')`,
  `INSERT OR IGNORE INTO "Setting" ("key","value") VALUES ('hotelAddress','Station Road, Kolkata')`,
  `INSERT OR IGNORE INTO "Setting" ("key","value") VALUES ('hotelPhone','+91 90000 00000')`,
  `INSERT OR IGNORE INTO "Setting" ("key","value") VALUES ('hotelGstin','')`,
  `INSERT OR IGNORE INTO "Setting" ("key","value") VALUES ('gstPercent','12')`,
  `INSERT OR IGNORE INTO "Setting" ("key","value") VALUES ('invoicePrefix','INV')`,
  `INSERT OR IGNORE INTO "Setting" ("key","value") VALUES ('invoiceCounter','1')`,
  `INSERT OR IGNORE INTO "ExpenseCategory" ("id","name","active") VALUES ('cat-salary','Salary',1)`,
  `INSERT OR IGNORE INTO "ExpenseCategory" ("id","name","active") VALUES ('cat-advance','Staff Advance',1)`,
  `INSERT OR IGNORE INTO "ExpenseCategory" ("id","name","active") VALUES ('cat-grocery','Groceries / Purchase',1)`,
  `INSERT OR IGNORE INTO "ExpenseCategory" ("id","name","active") VALUES ('cat-utilities','Utilities (EB/Water)',1)`,
  `INSERT OR IGNORE INTO "ExpenseCategory" ("id","name","active") VALUES ('cat-repairs','Repairs & Maintenance',1)`,
  `INSERT OR IGNORE INTO "ExpenseCategory" ("id","name","active") VALUES ('cat-housekeeping','Housekeeping Supplies',1)`,
  `INSERT OR IGNORE INTO "ExpenseCategory" ("id","name","active") VALUES ('cat-transport','Transport',1)`,
  `INSERT OR IGNORE INTO "ExpenseCategory" ("id","name","active") VALUES ('cat-marketing','Marketing',1)`,
  `INSERT OR IGNORE INTO "ExpenseCategory" ("id","name","active") VALUES ('cat-petty','Petty Cash',1)`,
  `INSERT OR IGNORE INTO "ExpenseCategory" ("id","name","active") VALUES ('cat-other','Other',1)`,
]

const ALL_STATEMENTS = [...NEW_TABLES, ...NEW_COLUMNS, ...SEED_DATA]

export async function migrateDb(client: PrismaClient): Promise<void> {
  for (const stmt of ALL_STATEMENTS) {
    try {
      await client.$executeRawUnsafe(stmt)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // Expected on already-migrated databases — silently ignore
      if (
        !msg.includes('duplicate column name') &&
        !msg.includes('already exists')
      ) {
        console.error('[db-migrate]', msg.slice(0, 120))
      }
    }
  }
}
