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
      
      // Check if services_json column exists (for multi-service appointments)
      const [servicesJsonRows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'appointments' AND COLUMN_NAME = 'services_json'
      `);
      
      if ((servicesJsonRows as any[]).length === 0) {
        await connection.query(`ALTER TABLE appointments ADD COLUMN services_json TEXT`);
        console.log("Added services_json column to appointments table");
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
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'services_json') THEN
            ALTER TABLE appointments ADD COLUMN services_json TEXT;
          END IF;
        END $$;
      `);
    }
    console.log("Appointments audit columns ready");
  } catch (error) {
    console.error("Failed to ensure appointments audit columns:", error);
  }
}

// Add foreign key constraints for data integrity (PostgreSQL only)
export async function ensureForeignKeyConstraints(): Promise<void> {
  if (dbDialect !== 'postgres') {
    console.log("Foreign key constraints are only added for PostgreSQL");
    return;
  }
  
  try {
    // Add foreign key from loyalty_redemptions to clients
    await pool.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'fk_loyalty_redemptions_client' 
          AND table_name = 'loyalty_redemptions'
        ) THEN
          ALTER TABLE loyalty_redemptions 
          ADD CONSTRAINT fk_loyalty_redemptions_client 
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL; -- Ignore errors if constraint cannot be added
      END $$;
    `);
    
    // Add foreign key from appointments to clients (if client_id exists)
    await pool.query(`
      DO $$ 
      BEGIN 
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'appointments' AND column_name = 'client_id'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'fk_appointments_client' 
          AND table_name = 'appointments'
        ) THEN
          ALTER TABLE appointments 
          ADD CONSTRAINT fk_appointments_client 
          FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END $$;
    `);
    
    // Add foreign key from charges to expense_categories
    await pool.query(`
      DO $$ 
      BEGIN 
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'charges' AND column_name = 'category_id'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'fk_charges_category' 
          AND table_name = 'charges'
        ) THEN
          ALTER TABLE charges 
          ADD CONSTRAINT fk_charges_category 
          FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON DELETE SET NULL;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END $$;
    `);
    
    // Add foreign key from services to products (linked_product_id)
    await pool.query(`
      DO $$ 
      BEGIN 
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'services' AND column_name = 'linked_product_id'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'fk_services_product' 
          AND table_name = 'services'
        ) THEN
          ALTER TABLE services 
          ADD CONSTRAINT fk_services_product 
          FOREIGN KEY (linked_product_id) REFERENCES products(id) ON DELETE SET NULL;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END $$;
    `);
    
    // Add indexes for better query performance
    await pool.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_appointments_date') THEN
          CREATE INDEX idx_appointments_date ON appointments(date);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_appointments_staff') THEN
          CREATE INDEX idx_appointments_staff ON appointments(staff);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_appointments_client_id') THEN
          CREATE INDEX idx_appointments_client_id ON appointments(client_id);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_charges_date') THEN
          CREATE INDEX idx_charges_date ON charges(date);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_staff_deductions_date') THEN
          CREATE INDEX idx_staff_deductions_date ON staff_deductions(date);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END $$;
    `);
    
    console.log("Foreign key constraints and indexes ready");
  } catch (error) {
    console.error("Failed to add foreign key constraints:", error);
  }
}

// Auto-migration: Add/upgrade photo_url column to admin_roles table (TEXT for base64 storage)
export async function ensureAdminRolesPhotoColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      
      // Check if photo_url column exists
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'admin_roles' AND COLUMN_NAME = 'photo_url'
      `);
      
      if ((rows as any[]).length === 0) {
        await connection.query(`ALTER TABLE admin_roles ADD COLUMN photo_url MEDIUMTEXT`);
        console.log("Added photo_url column (MEDIUMTEXT) to admin_roles table");
      } else if ((rows as any[])[0].DATA_TYPE === 'varchar') {
        // Upgrade from VARCHAR to MEDIUMTEXT for base64 storage
        await connection.query(`ALTER TABLE admin_roles MODIFY COLUMN photo_url MEDIUMTEXT`);
        console.log("Upgraded photo_url column to MEDIUMTEXT for base64 storage");
      }
      
      connection.release();
    } else {
      // PostgreSQL version - TEXT type can hold any size
      // First check if column exists
      const result = await pool.query(`
        SELECT data_type FROM information_schema.columns 
        WHERE table_name = 'admin_roles' AND column_name = 'photo_url'
      `);
      
      if (result.rows.length === 0) {
        // Column doesn't exist, add it
        await pool.query(`ALTER TABLE admin_roles ADD COLUMN photo_url TEXT`);
        console.log("Added photo_url column (TEXT) to admin_roles table");
      } else if (result.rows[0].data_type === 'character varying') {
        // Upgrade from VARCHAR to TEXT for base64 storage
        await pool.query(`ALTER TABLE admin_roles ALTER COLUMN photo_url TYPE TEXT`);
        console.log("Upgraded photo_url column to TEXT for base64 storage");
      }
    }
    console.log("Admin roles photo column ready");
  } catch (error) {
    console.error("Failed to ensure admin_roles photo_url column:", error);
  }
}
