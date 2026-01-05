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
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export const db = drizzle(pool, { schema, mode: "default" });

export async function warmupDatabase(): Promise<void> {
  try {
    const warmupPromises = [];
    for (let i = 0; i < 5; i++) {
      warmupPromises.push(
        pool.getConnection().then(async (connection) => {
          await connection.query("SELECT 1");
          connection.release();
        })
      );
    }
    await Promise.all(warmupPromises);
    console.log("Database connections warmed up successfully (5 connections ready)");
  } catch (error) {
    console.error("Database warmup failed:", error);
  }
}
