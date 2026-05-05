/**
 * Migration script: TiDB (MySQL) → Koyeb (PostgreSQL)
 * Usage: npx tsx script/migrate-tidb-to-koyeb.ts
 */

import mysql from "mysql2/promise";
import pg from "pg";

const MYSQL_URL = process.env.MYSQL_URL;
const PG_URL = process.env.KOYEB_DATABASE_URL;

if (!MYSQL_URL) { console.error("❌  MYSQL_URL is not set"); process.exit(1); }
if (!PG_URL)    { console.error("❌  KOYEB_DATABASE_URL is not set"); process.exit(1); }

// ── Boolean columns per table ──────────────────
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

// ── JSON columns per table (must be stringified for PG) ──
const JSON_COLS: Record<string, string[]> = {
  sessions:          ["sess"],
  business_settings: ["working_days", "planning_shortcuts"],
  admin_roles:       ["permissions"],
  services:          ["linked_product_ids"],
  packages:          ["services"],
  waitlist:          ["service_ids"],
};

// Tables to migrate in FK-safe order
const TABLES = [
  // Re-run failed tables first with fixed JSON handling
  "business_settings",
  "admin_roles",
  "services",
  // Remaining tables not yet migrated
  "charges",
  "staff_deductions",
  "loyalty_redemptions",
  "gift_cards",
  "gift_card_transactions",
  "referrals",
  "packages",
  "package_purchases",
  "waitlist",
  "tombola_spins",
];

// All serial-PK tables for sequence reset
const ALL_SERIAL_TABLES = [
  "categories", "expense_categories", "staff", "products", "clients",
  "business_settings", "admin_roles", "push_subscriptions", "page_views",
  "message_templates", "services", "staff_commissions", "staff_schedules",
  "staff_breaks", "staff_time_off", "staff_goals", "staff_payments",
  "salon_payments", "tombola_spins", "appointments", "charges",
  "staff_deductions", "loyalty_redemptions", "gift_cards", "gift_card_transactions",
  "referrals", "packages", "package_purchases", "waitlist",
];

// ── Value transformers ────────────────────────
function toBoolean(v: any): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (Buffer.isBuffer(v)) return v[0] === 1;
  return v === 1 || v === "1" || v === true;
}

function toJson(v: any): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    // Already a JSON string — validate and return
    try { JSON.parse(v); return v; } catch { return null; }
  }
  // Object/array — stringify for PG
  try { return JSON.stringify(v); } catch { return null; }
}

function processRow(
  row: Record<string, any>,
  boolCols: string[],
  jsonCols: string[]
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [col, val] of Object.entries(row)) {
    if (boolCols.includes(col))       out[col] = toBoolean(val);
    else if (jsonCols.includes(col))  out[col] = toJson(val);
    else if (val instanceof Date)     out[col] = val.toISOString();
    else if (Buffer.isBuffer(val))    out[col] = val.toString();
    else                              out[col] = val;
  }
  return out;
}

// ── Migrate one table ─────────────────────────
const BATCH = 200;

async function migrateTable(
  mysqlConn: mysql.Connection,
  pgClient: pg.Client,
  table: string
) {
  const [rows] = await mysqlConn.query(`SELECT * FROM \`${table}\``);
  const data = rows as Record<string, any>[];

  if (data.length === 0) {
    console.log(`  ⟶  ${table}: 0 rows (skipped)`);
    return;
  }

  const boolCols = BOOL_COLS[table]  || [];
  const jsonCols = JSON_COLS[table]  || [];
  const columns  = Object.keys(data[0]);
  const cols     = columns.map(c => `"${c}"`).join(", ");

  let inserted = 0;
  let skipped  = 0;

  // Process in batches
  for (let i = 0; i < data.length; i += BATCH) {
    const batch = data.slice(i, i + BATCH);

    for (const row of batch) {
      const processed   = processRow(row, boolCols, jsonCols);
      const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(", ");
      const values       = columns.map(c => processed[c]);

      try {
        await pgClient.query(
          `INSERT INTO "${table}" (${cols}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          values
        );
        inserted++;
      } catch (err: any) {
        console.warn(`  ⚠️  ${table} id=${row.id}: ${err.message.split("\n")[0]}`);
        skipped++;
      }
    }
  }

  console.log(`  ✓  ${table}: ${inserted} inserted${skipped ? `, ${skipped} skipped` : ""}`);
}

// ── Reset sequences ────────────────────────────
async function resetSequences(pgClient: pg.Client) {
  console.log("\n🔄  Resetting PostgreSQL sequences...");
  for (const table of ALL_SERIAL_TABLES) {
    try {
      await pgClient.query(
        `SELECT setval(
           pg_get_serial_sequence('"${table}"', 'id'),
           COALESCE((SELECT MAX(id) FROM "${table}"), 0) + 1,
           false
         )`
      );
    } catch { /* table may not exist */ }
  }
  console.log("  ✓  All sequences reset");
}

// ── Main ──────────────────────────────────────
async function main() {
  console.log("🚀  Resuming TiDB → Koyeb PostgreSQL migration\n");

  const mysqlConn = await mysql.createConnection({
    uri: MYSQL_URL!,
    ssl: { rejectUnauthorized: false },
  });
  console.log("✅  Connected to TiDB (MySQL)");

  const pgClient = new pg.Client({
    connectionString: PG_URL!,
    ssl: { rejectUnauthorized: false },
  });
  await pgClient.connect();
  console.log("✅  Connected to Koyeb (PostgreSQL)\n");

  for (const table of TABLES) {
    try {
      await migrateTable(mysqlConn, pgClient, table);
    } catch (err: any) {
      console.warn(`  ⚠️  ${table}: ${err.message} (skipping table)`);
    }
  }

  await resetSequences(pgClient);

  await mysqlConn.end();
  await pgClient.end();

  console.log("\n✅  Migration complete!");
}

main().catch(err => {
  console.error("❌  Migration failed:", err);
  process.exit(1);
});
