import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "@shared/schema";

if (!process.env.TIDB_DATABASE_URL) {
  throw new Error("TIDB_DATABASE_URL must be set");
}

const url = new URL(process.env.TIDB_DATABASE_URL);
url.searchParams.set("ssl", JSON.stringify({ rejectUnauthorized: true }));

const connection = await mysql.createConnection(url.toString());
export const db = drizzle(connection, { schema, mode: "default" });
