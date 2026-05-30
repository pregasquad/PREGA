/**
 * apply-migrations.js
 *
 * Applies all Drizzle SQL migration files directly to the database.
 * Use this instead of `drizzle-kit push` which requires an interactive TTY.
 *
 * Usage:
 *   node scripts/apply-migrations.js
 *
 * Reads:  lib/db/drizzle/*.sql  (in filename order)
 * Writes: creates/updates tables in DATABASE_URL postgres database
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
// Resolve pg from the api-server which has it as a dependency
const pg = require("../node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js");

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: dbUrl });

async function run() {
  await client.connect();
  console.log("Connected to database.");

  const migrationsDir = join(root, "lib/db/drizzle");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Found ${files.length} migration file(s): ${files.join(", ")}`);

  let totalApplied = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    console.log(`\nApplying ${file} (${statements.length} statements)...`);

    for (const stmt of statements) {
      try {
        await client.query(stmt);
        totalApplied++;
      } catch (err) {
        const msg = err.message || "";
        if (
          msg.includes("already exists") ||
          msg.includes("duplicate") ||
          err.code === "42P07" ||
          err.code === "42701"
        ) {
          totalSkipped++;
        } else {
          console.warn(`  WARN: ${msg.split("\n")[0]}`);
          totalFailed++;
        }
      }
    }
  }

  await client.end();

  console.log(
    `\nDone: ${totalApplied} applied, ${totalSkipped} skipped (already exist), ${totalFailed} warnings.`
  );

  if (totalFailed > 0) {
    console.log("Some statements had warnings — check output above.");
  } else {
    console.log("All migrations applied successfully.");
  }
}

run().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
