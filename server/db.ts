import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "@shared/schema";

const databaseUrl = process.env.TIDB_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("TIDB_DATABASE_URL or DATABASE_URL must be set.");
}

export const pool = mysql.createPool({
  uri: databaseUrl,
  ssl: {
    rejectUnauthorized: true,
  },
});
export const db = drizzle(pool, { schema, mode: "default" });
