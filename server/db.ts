import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "@shared/schema";

if (!process.env.TIDB_DATABASE_URL) {
  throw new Error("TIDB_DATABASE_URL must be set");
}

const url = new URL(process.env.TIDB_DATABASE_URL);
url.searchParams.set("ssl", JSON.stringify({ rejectUnauthorized: true }));

export const pool = mysql.createPool({
  uri: url.toString(),
  connectionLimit: 10,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

export const db = drizzle(pool, { schema, mode: "default" });
