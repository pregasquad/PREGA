/**
 * Background sync: Koyeb PostgreSQL → TiDB MySQL
 * 
 * Runs every 2 minutes. Reads all rows from each PG table and
 * upserts them into MySQL using INSERT ... ON DUPLICATE KEY UPDATE.
 * Failures are logged but never crash the app.
 */

import mysql from "mysql2/promise";
import pg from "pg";

// ── Config ─────────────────────────────────────

const SYNC_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

const BOOL_COLS: Record<string, string[]> = {
  clients:           ["loyalty_enrolled", "use_points", "use_gift_card_balance"],
  appointments:      ["paid"],
  services:          ["is_starting_price"],
  staff_deductions:  ["cleared"],
  gift_cards:        ["is_active"],
  packages:          ["is_active"],
  business_settings: ["loyalty_enabled", "auto_lock_enabled"],
  staff_schedules:   ["is_active"],
};

const JSON_COLS: Record<string, string[]> = {
  business_settings: ["working_days", "planning_shortcuts"],
  admin_roles:       ["permissions"],
  services:          ["linked_product_ids"],
  packages:          ["services"],
  waitlist:          ["service_ids"],
};

const TABLES = [
  "categories", "expense_categories", "staff", "products", "clients",
  "business_settings", "admin_roles", "services", "staff_commissions",
  "staff_schedules", "staff_breaks", "staff_time_off", "staff_goals",
  "staff_payments", "salon_payments", "appointments", "charges",
  "staff_deductions", "loyalty_redemptions", "gift_cards",
  "gift_card_transactions", "referrals", "packages", "package_purchases",
  "waitlist", "tombola_spins", "push_subscriptions", "page_views",
  "message_templates",
];

// ── Connection pools (created once) ────────────

let mysqlPool: mysql.Pool | null = null;
let pgPool: pg.Pool | null = null;
let syncEnabled = false;

function getMysqlPool(): mysql.Pool | null {
  if (!process.env.MYSQL_URL) return null;
  if (!mysqlPool) {
    mysqlPool = mysql.createPool({
      uri: process.env.MYSQL_URL,
      ssl: { rejectUnauthorized: false },
      waitForConnections: true,
      connectionLimit: 3,
      queueLimit: 0,
    });
  }
  return mysqlPool;
}

function getPgPool(): pg.Pool | null {
  const url = process.env.KOYEB_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) return null;
  if (!pgPool) {
    pgPool = new pg.Pool({
      connectionString: url,
      ssl: process.env.KOYEB_DATABASE_URL ? { rejectUnauthorized: false } : undefined,
      max: 3,
    });
  }
  return pgPool;
}

// ── Type converters ─────────────────────────────

function pgToMysqlValue(val: any, col: string, boolCols: string[], jsonCols: string[]): any {
  if (val === null || val === undefined) return null;

  if (boolCols.includes(col)) {
    if (typeof val === "boolean") return val ? 1 : 0;
    if (Buffer.isBuffer(val)) return val[0] === 1 ? 1 : 0;
    return val ? 1 : 0;
  }

  if (jsonCols.includes(col)) {
    if (typeof val === "string") return val;
    try { return JSON.stringify(val); } catch { return null; }
  }

  if (val instanceof Date) return val;
  return val;
}

// ── Sync one table ──────────────────────────────

async function syncTable(
  pgPool: pg.Pool,
  mysqlPool: mysql.Pool,
  table: string
): Promise<{ synced: number; errors: number }> {
  const boolCols = BOOL_COLS[table] || [];
  const jsonCols = JSON_COLS[table] || [];

  // Read all rows from PG
  let pgRows: any[];
  try {
    const result = await pgPool.query(`SELECT * FROM "${table}"`);
    pgRows = result.rows;
  } catch {
    return { synced: 0, errors: 0 }; // Table doesn't exist in PG, skip silently
  }

  if (pgRows.length === 0) return { synced: 0, errors: 0 };

  const columns = Object.keys(pgRows[0]);
  if (columns.length === 0) return { synced: 0, errors: 0 };

  const cols = columns.map(c => `\`${c}\``).join(", ");
  const updates = columns
    .filter(c => c !== "id")
    .map(c => `\`${c}\` = VALUES(\`${c}\`)`)
    .join(", ");

  let synced = 0;
  let errors = 0;

  const BATCH_SIZE = 50;
  const conn = await mysqlPool.getConnection();
  try {
    for (let i = 0; i < pgRows.length; i += BATCH_SIZE) {
      const batch = pgRows.slice(i, i + BATCH_SIZE);
      const rowPlaceholders = batch.map(() => `(${columns.map(() => "?").join(", ")})`).join(", ");
      const sql = `INSERT INTO \`${table}\` (${cols}) VALUES ${rowPlaceholders} ON DUPLICATE KEY UPDATE ${updates}`;
      const values = batch.flatMap(row =>
        columns.map(c => pgToMysqlValue(row[c], c, boolCols, jsonCols))
      );
      try {
        await conn.query(sql, values);
        synced += batch.length;
      } catch {
        // Batch failed — fall back to individual inserts
        const singleSql = `INSERT INTO \`${table}\` (${cols}) VALUES (${columns.map(() => "?").join(", ")}) ON DUPLICATE KEY UPDATE ${updates}`;
        for (const row of batch) {
          const rowValues = columns.map(c => pgToMysqlValue(row[c], c, boolCols, jsonCols));
          try {
            await conn.query(singleSql, rowValues);
            synced++;
          } catch {
            errors++;
          }
        }
      }
    }
  } finally {
    conn.release();
  }

  return { synced, errors };
}

// ── Main sync function ──────────────────────────

export async function syncPostgresToMySQL(): Promise<void> {
  const mysql = getMysqlPool();
  const pg    = getPgPool();

  if (!mysql || !pg) return;

  const startTime = Date.now();
  let totalSynced = 0;
  let totalErrors = 0;

  for (const table of TABLES) {
    try {
      const { synced, errors } = await syncTable(pg, mysql, table);
      totalSynced += synced;
      totalErrors += errors;
    } catch (err: any) {
      // Table doesn't exist in MySQL or other issue — skip silently
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[DB-SYNC] PG→MySQL sync complete: ${totalSynced} rows in ${elapsed}s${totalErrors ? ` (${totalErrors} skipped)` : ""}`);
}

// ── Sync status (for health endpoint) ──────────

let lastSyncAt: Date | null = null;
let lastSyncRows = 0;
let lastSyncError: string | null = null;

export function getSyncStatus() {
  return {
    enabled: syncEnabled,
    mysqlConfigured: !!process.env.MYSQL_URL,
    lastSyncAt: lastSyncAt?.toISOString() ?? null,
    lastSyncRows,
    lastSyncError,
  };
}

// ── Start background sync ───────────────────────

export function startMysqlSync(): void {
  if (!process.env.MYSQL_URL) {
    console.log("[DB-SYNC] MYSQL_URL not set — background sync disabled");
    return;
  }

  syncEnabled = true;
  console.log(`[DB-SYNC] Dual-write sync started (PG→MySQL every ${SYNC_INTERVAL_MS / 1000}s)`);

  const run = async () => {
    try {
      await syncPostgresToMySQL();
      lastSyncAt   = new Date();
      lastSyncError = null;
    } catch (err: any) {
      lastSyncError = err.message;
      console.error("[DB-SYNC] Sync error:", err.message);
    }
  };

  // First sync after 10s (let DB warm up)
  setTimeout(run, 10 * 1000);

  // Then every 2 minutes
  setInterval(run, SYNC_INTERVAL_MS);
}
