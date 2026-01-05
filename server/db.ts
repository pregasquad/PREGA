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

export async function ensurePushSubscriptionsTable(): Promise<void> {
  try {
    const connection = await pool.getConnection();
    await connection.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      )
    `);
    connection.release();
    console.log("Push subscriptions table ready");
  } catch (error) {
    console.error("Failed to create push_subscriptions table:", error);
  }
}
