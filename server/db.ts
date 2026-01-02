import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "@shared/schema";

let host: string;
let port: number;
let user: string;
let password: string;
let database: string;

if (process.env.TIDB_HOST) {
  host = process.env.TIDB_HOST;
  port = parseInt(process.env.TIDB_PORT || "4000");
  user = process.env.TIDB_USER || "";
  password = process.env.TIDB_PASSWORD || "";
  database = process.env.TIDB_DATABASE || "";
} else if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith("mysql://")) {
  const url = new URL(process.env.DATABASE_URL);
  host = url.hostname;
  port = parseInt(url.port || "4000");
  user = decodeURIComponent(url.username);
  password = decodeURIComponent(url.password);
  database = url.pathname.slice(1).split("?")[0];
} else {
  throw new Error(
    "Database credentials must be set: TIDB_HOST/USER/PASSWORD/DATABASE or DATABASE_URL (mysql://...)",
  );
}

if (!host || !user || !password || !database) {
  throw new Error("Missing database credentials");
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
