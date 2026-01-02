import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "@shared/schema";

const host = process.env.TIDB_HOST;
const port = parseInt(process.env.TIDB_PORT || "4000");
const user = process.env.TIDB_USER;
const password = process.env.TIDB_PASSWORD;
const database = process.env.TIDB_DATABASE;

if (!host || !user || !password || !database) {
  throw new Error(
    "TiDB credentials must be set: TIDB_HOST, TIDB_USER, TIDB_PASSWORD, TIDB_DATABASE",
  );
}

export const pool = mysql.createPool({
  host,
  port,
  user,
  password,
  database,
  ssl: {
    rejectUnauthorized: true,
  },
  waitForConnections: true,
  connectionLimit: 10,
});

export const db = drizzle(pool, { schema, mode: "default" });
