import * as postgresSchema from "@shared/schema/postgres";

export const dbDialect = process.env.DB_DIALECT || 'postgres';

function getDatabaseUrl(): string {
  if (dbDialect === 'mysql') {
    const mysqlUrl = process.env.MYSQL_URL;
    if (!mysqlUrl) {
      throw new Error("MYSQL_URL must be set for MySQL/TiDB mode.");
    }
    return mysqlUrl;
  } else {
    const pgUrl = process.env.DATABASE_URL;
    if (!pgUrl) {
      throw new Error("DATABASE_URL must be set for PostgreSQL mode.");
    }
    return pgUrl;
  }
}

let db: any;
let pool: any;
let schema: any = postgresSchema;

export async function initializeDatabase() {
  const databaseUrl = getDatabaseUrl();
  
  if (dbDialect === 'mysql') {
    const { drizzle } = await import("drizzle-orm/mysql2");
    const mysql = await import("mysql2/promise");
    const schemaModule = await import("@shared/schema/mysql");
    schema = schemaModule;
    
    pool = mysql.default.createPool({
      uri: databaseUrl,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      ssl: {
        rejectUnauthorized: true,
      },
    });
    
    db = drizzle(pool, { schema, mode: "default" });
    console.log("Using MySQL/TiDB database");
  } else {
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    const { Pool, neonConfig } = await import("@neondatabase/serverless");
    const ws = (await import("ws")).default;
    
    neonConfig.webSocketConstructor = ws;
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });
    console.log("Using PostgreSQL database");
  }
}

export function getDb() {
  if (!db) throw new Error("Database not initialized. Call initializeDatabase() first.");
  return db;
}

export function getPool() {
  if (!pool) throw new Error("Database not initialized. Call initializeDatabase() first.");
  return pool;
}

export function getSchema() {
  return schema;
}

export { getDb as db, getPool as pool, getSchema as schema };

export async function warmupDatabase(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      await connection.query("SELECT 1");
      connection.release();
    } else {
      await pool.query("SELECT 1");
    }
    console.log("Database connection ready");
  } catch (error) {
    console.error("Database warmup failed:", error);
  }
}

export async function ensurePushSubscriptionsTable(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
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
    } else {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS push_subscriptions (
          id SERIAL PRIMARY KEY,
          endpoint TEXT NOT NULL,
          p256dh TEXT NOT NULL,
          auth TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
        )
      `);
    }
    console.log("Push subscriptions table ready");
  } catch (error) {
    console.error("Failed to create push_subscriptions table:", error);
  }
}

// Auto-migration: Add missing columns to appointments table
export async function ensureAppointmentsAuditColumns(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      
      // Check if created_by column exists
      const [createdByRows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'appointments' AND COLUMN_NAME = 'created_by'
      `);
      
      if ((createdByRows as any[]).length === 0) {
        await connection.query(`ALTER TABLE appointments ADD COLUMN created_by TEXT`);
        console.log("Added created_by column to appointments table");
      }
      
      // Check if created_at column exists
      const [createdAtRows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'appointments' AND COLUMN_NAME = 'created_at'
      `);
      
      if ((createdAtRows as any[]).length === 0) {
        await connection.query(`ALTER TABLE appointments ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
        console.log("Added created_at column to appointments table");
      }
      
      connection.release();
    } else {
      // PostgreSQL version
      await pool.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'created_by') THEN
            ALTER TABLE appointments ADD COLUMN created_by TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'created_at') THEN
            ALTER TABLE appointments ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
          END IF;
        END $$;
      `);
    }
    console.log("Appointments audit columns ready");
  } catch (error) {
    console.error("Failed to ensure appointments audit columns:", error);
  }
}
