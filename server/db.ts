import * as postgresSchema from "@shared/schema/postgres";

export const dbDialect = process.env.DB_DIALECT || 'postgres';

let isOfflineMode = false;
let lastConnectionCheck = 0;
const CONNECTION_CHECK_INTERVAL = 30000;

export function isDatabaseOffline(): boolean {
  return isOfflineMode;
}

export function setOfflineMode(offline: boolean): void {
  if (isOfflineMode !== offline) {
    isOfflineMode = offline;
    console.log(offline ? "OFFLINE MODE: Database unavailable, using local storage" : "ONLINE MODE: Database connected");
  }
}

function getDatabaseUrl(): string | null {
  if (dbDialect === 'mysql') {
    const mysqlUrl = process.env.MYSQL_URL;
    if (!mysqlUrl) {
      console.warn("MYSQL_URL not set - running in offline mode");
      return null;
    }
    return mysqlUrl;
  } else {
    const pgUrl = process.env.DATABASE_URL;
    if (!pgUrl) {
      console.warn("DATABASE_URL not set - running in offline mode");
      return null;
    }
    return pgUrl;
  }
}

let db: any;
let pool: any;
let schema: any = postgresSchema;

export async function initializeDatabase(): Promise<boolean> {
  const databaseUrl = getDatabaseUrl();
  
  if (!databaseUrl) {
    setOfflineMode(true);
    console.log("Starting in OFFLINE MODE - no database configured");
    return false;
  }
  
  try {
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
          rejectUnauthorized: false,
        },
      });
      
      db = drizzle(pool, { schema, mode: "default" });
      console.log("Using MySQL/TiDB database");
    } else {
      const { drizzle } = await import("drizzle-orm/node-postgres");
      const pg = await import("pg");
      
      pool = new pg.default.Pool({ connectionString: databaseUrl });
      db = drizzle(pool, { schema });
      console.log("Using PostgreSQL database");
    }
    
    setOfflineMode(false);
    return true;
  } catch (error) {
    console.error("Failed to initialize database:", error);
    setOfflineMode(true);
    return false;
  }
}

export async function checkDatabaseConnection(): Promise<boolean> {
  const now = Date.now();
  if (now - lastConnectionCheck < CONNECTION_CHECK_INTERVAL) {
    return !isOfflineMode;
  }
  lastConnectionCheck = now;

  if (!pool) {
    const initialized = await initializeDatabase();
    return initialized;
  }

  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      await connection.query("SELECT 1");
      connection.release();
    } else {
      await pool.query("SELECT 1");
    }
    setOfflineMode(false);
    return true;
  } catch (error) {
    console.error("Database connection check failed:", error);
    setOfflineMode(true);
    return false;
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

export async function warmupDatabase(): Promise<boolean> {
  if (isOfflineMode || !pool) {
    console.log("Skipping database warmup - offline mode");
    return false;
  }
  
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      await connection.query("SELECT 1");
      connection.release();
    } else {
      await pool.query("SELECT 1");
    }
    console.log("Database connection ready");
    return true;
  } catch (error) {
    console.error("Database warmup failed:", error);
    setOfflineMode(true);
    return false;
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

export async function ensureAppointmentDiscountColumns(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const discountCols = ['loyalty_discount_amount', 'loyalty_points_redeemed', 'gift_card_discount_amount'];
      for (const col of discountCols) {
        const [rows] = await connection.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'appointments' AND COLUMN_NAME = ?`,
          [col]
        );
        if ((rows as any[]).length === 0) {
          const colType = col.includes('points') ? 'INT DEFAULT 0' : 'DOUBLE DEFAULT 0';
          await connection.query(`ALTER TABLE appointments ADD COLUMN ${col} ${colType}`);
          console.log(`Added ${col} column to appointments table`);
        }
      }
      connection.release();
    } else {
      await pool.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'loyalty_discount_amount') THEN
            ALTER TABLE appointments ADD COLUMN loyalty_discount_amount DOUBLE PRECISION DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'loyalty_points_redeemed') THEN
            ALTER TABLE appointments ADD COLUMN loyalty_points_redeemed INTEGER DEFAULT 0;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'gift_card_discount_amount') THEN
            ALTER TABLE appointments ADD COLUMN gift_card_discount_amount DOUBLE PRECISION DEFAULT 0;
          END IF;
        END $$;
      `);
    }
    console.log("Appointment discount columns ready");
  } catch (error) {
    console.error("Failed to ensure appointment discount columns:", error);
  }
}

// Backfill staffId and ensure missing columns for MySQL/TiDB databases
export async function ensureStaffIdBackfillMySQL(): Promise<void> {
  if (dbDialect !== 'mysql') return;
  
  try {
    const connection = await pool.getConnection();
    
    // Ensure photo_url column exists on staff (MEDIUMTEXT for base64)
    const [photoRows] = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'staff' AND COLUMN_NAME = 'photo_url'
    `);
    if ((photoRows as any[]).length === 0) {
      await connection.query(`ALTER TABLE staff ADD COLUMN photo_url MEDIUMTEXT`);
      console.log("Added photo_url column (MEDIUMTEXT) to staff table");
    }
    
    // Ensure staff_id column exists on appointments
    const [appStaffIdRows] = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'appointments' AND COLUMN_NAME = 'staff_id'
    `);
    if ((appStaffIdRows as any[]).length === 0) {
      await connection.query(`ALTER TABLE appointments ADD COLUMN staff_id INT`);
      console.log("Added staff_id column to appointments table");
    }
    
    // Ensure staff_id column exists on staff_deductions
    const [dedStaffIdRows] = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'staff_deductions' AND COLUMN_NAME = 'staff_id'
    `);
    if ((dedStaffIdRows as any[]).length === 0) {
      await connection.query(`ALTER TABLE staff_deductions ADD COLUMN staff_id INT`);
      console.log("Added staff_id column to staff_deductions table");
    }
    
    // Backfill staff_id from staff name matching
    await connection.query(`
      UPDATE appointments a
      JOIN staff s ON a.staff = s.name
      SET a.staff_id = s.id
      WHERE a.staff_id IS NULL
    `);
    
    await connection.query(`
      UPDATE staff_deductions d
      JOIN staff s ON d.staff_name = s.name
      SET d.staff_id = s.id
      WHERE d.staff_id IS NULL
    `);
    
    // Add indexes for staff_id columns
    const [appIdxRows] = await connection.query(`
      SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_NAME = 'appointments' AND INDEX_NAME = 'idx_appointments_staff_id'
    `);
    if ((appIdxRows as any[]).length === 0) {
      await connection.query(`CREATE INDEX idx_appointments_staff_id ON appointments(staff_id)`);
    }
    
    const [dedIdxRows] = await connection.query(`
      SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_NAME = 'staff_deductions' AND INDEX_NAME = 'idx_staff_deductions_staff_id'
    `);
    if ((dedIdxRows as any[]).length === 0) {
      await connection.query(`CREATE INDEX idx_staff_deductions_staff_id ON staff_deductions(staff_id)`);
    }
    
    connection.release();
    console.log("Staff ID backfill ready (MySQL/TiDB)");
  } catch (error) {
    console.error("Failed to backfill staff IDs for MySQL/TiDB:", error);
  }
}

export async function ensureStaffPaymentsTable(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      await connection.query(`
        CREATE TABLE IF NOT EXISTS staff_payments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          staff_id INT NOT NULL,
          staff_name TEXT NOT NULL,
          amount DOUBLE NOT NULL,
          paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
        )
      `);
      connection.release();
    } else {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS staff_payments (
          id SERIAL PRIMARY KEY,
          staff_id INT NOT NULL,
          staff_name TEXT NOT NULL,
          amount DOUBLE PRECISION NOT NULL,
          paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
        )
      `);
    }
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [staffRows] = await connection.query(`
        SELECT s.id, s.name FROM staff s
        WHERE s.id NOT IN (SELECT DISTINCT staff_id FROM staff_payments)
      `);
      for (const staff of staffRows as any[]) {
        await connection.query(
          `INSERT INTO staff_payments (staff_id, staff_name, amount, paid_at, created_at) VALUES (?, ?, 0, NOW(), NOW())`,
          [staff.id, staff.name]
        );
      }
      connection.release();
    } else {
      const { rows: staffRows } = await pool.query(`
        SELECT s.id, s.name FROM staff s
        WHERE s.id NOT IN (SELECT DISTINCT staff_id FROM staff_payments)
      `);
      for (const staff of staffRows) {
        await pool.query(
          `INSERT INTO staff_payments (staff_id, staff_name, amount, paid_at, created_at) VALUES ($1, $2, 0, NOW(), NOW())`,
          [staff.id, staff.name]
        );
      }
    }
    console.log("Staff payments table ready");
  } catch (error) {
    console.error("Failed to create staff_payments table:", error);
  }
}

export async function ensureStaffPublicTokens(): Promise<void> {
  try {
    const { randomUUID } = await import("crypto");
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      await connection.query(`
        ALTER TABLE staff ADD COLUMN IF NOT EXISTS public_token TEXT
      `).catch(() => {});
      const [staffRows] = await connection.query(`
        SELECT id FROM staff WHERE public_token IS NULL
      `);
      for (const staff of staffRows as any[]) {
        const token = randomUUID();
        await connection.query(
          `UPDATE staff SET public_token = ? WHERE id = ?`,
          [token, staff.id]
        );
      }
      connection.release();
    } else {
      await pool.query(`
        ALTER TABLE staff ADD COLUMN IF NOT EXISTS public_token TEXT
      `);
      const { rows: staffRows } = await pool.query(`
        SELECT id FROM staff WHERE public_token IS NULL
      `);
      for (const staff of staffRows) {
        const token = randomUUID();
        await pool.query(
          `UPDATE staff SET public_token = $1 WHERE id = $2`,
          [token, staff.id]
        );
      }
    }
    console.log("Staff public tokens ready");
  } catch (error) {
    console.error("Failed to ensure staff public tokens:", error);
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
    
    // PostgreSQL version
    await pool.query(`
      DO $$ 
      BEGIN 
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'staff_id') THEN
          ALTER TABLE appointments ADD COLUMN staff_id INTEGER;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff_deductions' AND column_name = 'staff_id') THEN
          ALTER TABLE staff_deductions ADD COLUMN staff_id INTEGER;
        END IF;
      END $$;
    `);

    // Backfill staffId for appointments and staff_deductions from staff name
    await pool.query(`
      UPDATE appointments a
      SET staff_id = s.id
      FROM staff s
      WHERE a.staff = s.name
      AND a.staff_id IS NULL;
    `);
    await pool.query(`
      UPDATE staff_deductions d
      SET staff_id = s.id
      FROM staff s
      WHERE d.staff_name = s.name
      AND d.staff_id IS NULL;
    `);
    console.log("Staff ID backfill ready");

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
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_appointments_staff_id') THEN
          CREATE INDEX idx_appointments_staff_id ON appointments(staff_id);
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
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_staff_deductions_staff_id') THEN
          CREATE INDEX idx_staff_deductions_staff_id ON staff_deductions(staff_id);
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

export async function ensureProductExpiryColumns(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      
      const [expiryRows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'products' AND COLUMN_NAME = 'expiry_date'
      `);
      
      if ((expiryRows as any[]).length === 0) {
        await connection.query(`ALTER TABLE products ADD COLUMN expiry_date TEXT`);
        console.log("Added expiry_date column to products table");
      }
      
      const [warningRows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'products' AND COLUMN_NAME = 'expiry_warning_days'
      `);
      
      if ((warningRows as any[]).length === 0) {
        await connection.query(`ALTER TABLE products ADD COLUMN expiry_warning_days INT NOT NULL DEFAULT 30`);
        console.log("Added expiry_warning_days column to products table");
      }
      
      connection.release();
    } else {
      await pool.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'expiry_date') THEN
            ALTER TABLE products ADD COLUMN expiry_date TEXT;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'expiry_warning_days') THEN
            ALTER TABLE products ADD COLUMN expiry_warning_days INTEGER NOT NULL DEFAULT 30;
          END IF;
        END $$;
      `);
    }
    console.log("Product expiry columns ready");
  } catch (error) {
    console.error("Failed to ensure product expiry columns:", error);
  }
}

export async function ensureDeductionClearedColumns(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'staff_deductions' AND COLUMN_NAME = 'cleared'
      `);
      if ((rows as any[]).length === 0) {
        await connection.query(`ALTER TABLE staff_deductions ADD COLUMN cleared BOOLEAN NOT NULL DEFAULT FALSE`);
        await connection.query(`ALTER TABLE staff_deductions ADD COLUMN cleared_at TIMESTAMP NULL`);
      }
      connection.release();
    } else {
      await pool.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff_deductions' AND column_name = 'cleared') THEN
            ALTER TABLE staff_deductions ADD COLUMN cleared BOOLEAN NOT NULL DEFAULT FALSE;
            ALTER TABLE staff_deductions ADD COLUMN cleared_at TIMESTAMP;
          END IF;
        END $$;
      `);
    }
    console.log("Deduction cleared columns ready");
  } catch (error) {
    console.error("Failed to ensure deduction cleared columns:", error);
  }
}

export async function ensureAutoLockColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'business_settings' AND COLUMN_NAME = 'auto_lock_enabled'
      `);
      if ((rows as any[]).length === 0) {
        await connection.query(`ALTER TABLE business_settings ADD COLUMN auto_lock_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
        console.log("Added auto_lock_enabled column to business_settings table");
      }
      connection.release();
    } else {
      await pool.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_settings' AND column_name = 'auto_lock_enabled') THEN
            ALTER TABLE business_settings ADD COLUMN auto_lock_enabled BOOLEAN NOT NULL DEFAULT FALSE;
          END IF;
        END $$;
      `);
    }
    console.log("Auto-lock column ready");
  } catch (error) {
    console.error("Failed to ensure auto_lock_enabled column:", error);
  }
}

export async function ensureChargeAttachmentColumns(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'charges' AND COLUMN_NAME = 'attachment'
      `);
      if ((rows as any[]).length === 0) {
        await connection.query(`ALTER TABLE charges ADD COLUMN attachment LONGTEXT NULL DEFAULT NULL`);
        await connection.query(`ALTER TABLE charges ADD COLUMN attachment_name VARCHAR(500) NULL`);
        console.log("Added attachment columns to charges table");
      }
      connection.release();
    } else {
      await pool.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'charges' AND column_name = 'attachment') THEN
            ALTER TABLE charges ADD COLUMN attachment TEXT NULL;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'charges' AND column_name = 'attachment_name') THEN
            ALTER TABLE charges ADD COLUMN attachment_name TEXT NULL;
          END IF;
        END $$;
      `);
    }
    console.log("Charge attachment columns ready");
  } catch (error) {
    console.error("Failed to ensure charge attachment columns:", error);
  }
}

export async function ensureServiceStartingPriceColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'services' AND COLUMN_NAME = 'is_starting_price'
      `);
      if ((rows as any[]).length === 0) {
        await connection.query(`ALTER TABLE services ADD COLUMN is_starting_price BOOLEAN NOT NULL DEFAULT FALSE`);
        console.log("Added is_starting_price column to services table");
      }
      connection.release();
    } else {
      await pool.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'is_starting_price') THEN
            ALTER TABLE services ADD COLUMN is_starting_price BOOLEAN NOT NULL DEFAULT FALSE;
          END IF;
        END $$;
      `);
    }
    console.log("Service starting price column ready");
  } catch (error) {
    console.error("Failed to ensure service starting price column:", error);
  }
}

export async function ensurePlanningShortcutsColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'business_settings' AND COLUMN_NAME = 'planning_shortcuts'
      `);
      if ((rows as any[]).length === 0) {
        // In MySQL/TiDB, JSON columns cannot have a literal string default in older versions
        // Add column without default, then update existing rows
        await connection.query(`ALTER TABLE business_settings ADD COLUMN planning_shortcuts JSON`);
        await connection.query(`UPDATE business_settings SET planning_shortcuts = '["services","clients","salaries","inventory"]' WHERE planning_shortcuts IS NULL`);
        console.log("Added planning_shortcuts column to business_settings table");
      }
      connection.release();
    } else {
      await pool.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_settings' AND column_name = 'planning_shortcuts') THEN
            ALTER TABLE business_settings ADD COLUMN planning_shortcuts JSON NOT NULL DEFAULT '["services","clients","salaries","inventory"]';
          END IF;
        END $$;
      `);
    }
    console.log("Planning shortcuts column ready");
  } catch (error) {
    console.error("Failed to ensure planning_shortcuts column:", error);
  }
}
