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
let schema: any = null;

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
      const schemaModule = await import("./schema-mysql.js");
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
      // @ts-ignore - pg types not available in this environment
      const pg = await import("pg");
      const postgresSchema = await import("@workspace/db");
      schema = postgresSchema;

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
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'created_by'
      `);
      
      if ((createdByRows as any[]).length === 0) {
        await connection.query(`ALTER TABLE appointments ADD COLUMN created_by TEXT`);
        console.log("Added created_by column to appointments table");
      }
      
      // Check if created_at column exists
      const [createdAtRows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'created_at'
      `);
      
      if ((createdAtRows as any[]).length === 0) {
        await connection.query(`ALTER TABLE appointments ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
        console.log("Added created_at column to appointments table");
      }
      
      // Check if services_json column exists (for multi-service appointments)
      const [servicesJsonRows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'services_json'
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
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = ?`,
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
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff' AND COLUMN_NAME = 'photo_url'
    `);
    if ((photoRows as any[]).length === 0) {
      await connection.query(`ALTER TABLE staff ADD COLUMN photo_url MEDIUMTEXT`);
      console.log("Added photo_url column (MEDIUMTEXT) to staff table");
    }
    
    // Ensure staff_id column exists on appointments
    const [appStaffIdRows] = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'staff_id'
    `);
    if ((appStaffIdRows as any[]).length === 0) {
      await connection.query(`ALTER TABLE appointments ADD COLUMN staff_id INT`);
      console.log("Added staff_id column to appointments table");
    }
    
    // Ensure staff_id column exists on staff_deductions
    const [dedStaffIdRows] = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_deductions' AND COLUMN_NAME = 'staff_id'
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
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND INDEX_NAME = 'idx_appointments_staff_id'
    `);
    if ((appIdxRows as any[]).length === 0) {
      await connection.query(`CREATE INDEX idx_appointments_staff_id ON appointments(staff_id)`);
    }
    
    const [dedIdxRows] = await connection.query(`
      SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_deductions' AND INDEX_NAME = 'idx_staff_deductions_staff_id'
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
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_clients_phone') THEN
          CREATE INDEX idx_clients_phone ON clients(phone);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_clients_created_at') THEN
          CREATE INDEX idx_clients_created_at ON clients(created_at);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_appointments_phone') THEN
          CREATE INDEX idx_appointments_phone ON appointments(phone);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_bot_memory_jid') THEN
          CREATE INDEX idx_bot_memory_jid ON bot_client_memory(jid);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_bot_memory_phone') THEN
          CREATE INDEX idx_bot_memory_phone ON bot_client_memory(phone);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_appointments_paid') THEN
          CREATE INDEX idx_appointments_paid ON appointments(paid);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_appointments_date_paid') THEN
          CREATE INDEX idx_appointments_date_paid ON appointments(date, paid);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_salon_payments_collected_at') THEN
          CREATE INDEX idx_salon_payments_collected_at ON salon_payments(collected_at);
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
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_roles' AND COLUMN_NAME = 'photo_url'
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
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'expiry_date'
      `);
      
      if ((expiryRows as any[]).length === 0) {
        await connection.query(`ALTER TABLE products ADD COLUMN expiry_date TEXT`);
        console.log("Added expiry_date column to products table");
      }
      
      const [warningRows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'expiry_warning_days'
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
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_deductions' AND COLUMN_NAME = 'cleared'
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

export async function ensureDeductionPaidBackColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff_deductions' AND COLUMN_NAME = 'paid_back'
      `);
      if ((rows as any[]).length === 0) {
        await connection.query(`ALTER TABLE staff_deductions ADD COLUMN paid_back DOUBLE NOT NULL DEFAULT 0`);
      }
      connection.release();
    } else {
      await pool.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff_deductions' AND column_name = 'paid_back') THEN
            ALTER TABLE staff_deductions ADD COLUMN paid_back DOUBLE PRECISION NOT NULL DEFAULT 0;
          END IF;
        END $$;
      `);
    }
    console.log("Deduction paid_back column ready");
  } catch (error) {
    console.error("Failed to ensure deduction paid_back column:", error);
  }
}

export async function ensureAutoLockColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'business_settings' AND COLUMN_NAME = 'auto_lock_enabled'
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
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charges' AND COLUMN_NAME = 'attachment'
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
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'is_starting_price'
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

export async function ensureServiceMaxPriceColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'max_price'
      `);
      if ((rows as any[]).length === 0) {
        await connection.query(`ALTER TABLE services ADD COLUMN max_price DOUBLE NULL`);
        console.log("Added max_price column to services table");
      }
      connection.release();
    } else {
      await pool.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'max_price') THEN
            ALTER TABLE services ADD COLUMN max_price DOUBLE PRECISION NULL;
          END IF;
        END $$;
      `);
    }
    console.log("Service max price column ready");
  } catch (error) {
    console.error("Failed to ensure service max price column:", error);
  }
}

export async function ensureServiceEmojiColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'services' AND COLUMN_NAME = 'emoji'
      `);
      if ((rows as any[]).length === 0) {
        await connection.query(`ALTER TABLE services ADD COLUMN emoji VARCHAR(10) NULL`);
        console.log("Added emoji column to services table");
      }
      connection.release();
    } else {
      await pool.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'services' AND column_name = 'emoji') THEN
            ALTER TABLE services ADD COLUMN emoji VARCHAR(10) NULL;
          END IF;
        END $$;
      `);
    }
    console.log("Service emoji column ready");
  } catch (error) {
    console.error("Failed to ensure service emoji column:", error);
  }
}

export async function ensurePlanningShortcutsColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'business_settings' AND COLUMN_NAME = 'planning_shortcuts'
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

export async function ensurePlanningSlotHeightColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'business_settings' AND COLUMN_NAME = 'planning_slot_height'
      `);
      if ((rows as any[]).length === 0) {
        await connection.query(`ALTER TABLE business_settings ADD COLUMN planning_slot_height INT NOT NULL DEFAULT 44`);
        console.log("Added planning_slot_height column to business_settings table");
      }
      connection.release();
    } else {
      await pool.query(`
        DO $$ 
        BEGIN 
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_settings' AND column_name = 'planning_slot_height') THEN
            ALTER TABLE business_settings ADD COLUMN planning_slot_height INTEGER NOT NULL DEFAULT 44;
          END IF;
        END $$;
      `);
    }
    console.log("Planning slot height column ready");
  } catch (error) {
    console.error("Failed to ensure planning_slot_height column:", error);
  }
}

export async function ensureTombolaSpinsTable(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      await connection.query(`
        CREATE TABLE IF NOT EXISTS tombola_spins (
          id INT AUTO_INCREMENT PRIMARY KEY,
          device_id VARCHAR(255) NOT NULL DEFAULT '',
          result VARCHAR(100) NOT NULL DEFAULT '',
          segment_index INT NOT NULL DEFAULT 0,
          spun_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          INDEX idx_tombola_device (device_id)
        )
      `);
      // Migrate existing table: add any missing columns
      const migrations = [
        `ALTER TABLE tombola_spins ADD COLUMN device_id VARCHAR(255) NOT NULL DEFAULT ''`,
        `ALTER TABLE tombola_spins ADD COLUMN result VARCHAR(100) NOT NULL DEFAULT ''`,
        `ALTER TABLE tombola_spins ADD COLUMN segment_index INT NOT NULL DEFAULT 0`,
        `ALTER TABLE tombola_spins ADD COLUMN spun_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL`,
        `ALTER TABLE tombola_spins ADD INDEX idx_tombola_device (device_id)`,
      ];
      for (const sql of migrations) {
        try { await connection.query(sql); } catch (_) { /* column/index already exists */ }
      }
      connection.release();
    } else {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tombola_spins (
          id SERIAL PRIMARY KEY,
          device_id VARCHAR(255) NOT NULL DEFAULT '',
          result VARCHAR(100) NOT NULL DEFAULT '',
          segment_index INT NOT NULL DEFAULT 0,
          spun_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
        )
      `);
      const pgMigrations = [
        `ALTER TABLE tombola_spins ADD COLUMN IF NOT EXISTS device_id VARCHAR(255) NOT NULL DEFAULT ''`,
        `ALTER TABLE tombola_spins ADD COLUMN IF NOT EXISTS result VARCHAR(100) NOT NULL DEFAULT ''`,
        `ALTER TABLE tombola_spins ADD COLUMN IF NOT EXISTS segment_index INT NOT NULL DEFAULT 0`,
        `ALTER TABLE tombola_spins ADD COLUMN IF NOT EXISTS spun_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL`,
      ];
      for (const sql of pgMigrations) {
        try { await pool.query(sql); } catch (_) { /* already exists */ }
      }
      try {
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_tombola_device ON tombola_spins(device_id)`);
      } catch (_) {}
    }
    console.log("Tombola spins table ready");
  } catch (error) {
    console.error("Failed to ensure tombola_spins table:", error);
  }
}

export async function ensureBookingStatusColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'booking_status'`
      );
      if ((rows as any[]).length === 0) {
        await connection.query(`ALTER TABLE appointments ADD COLUMN booking_status VARCHAR(20) DEFAULT 'pending'`);
        console.log("Added booking_status column to appointments table");
      }
      connection.release();
    } else {
      await pool.query(`
        ALTER TABLE appointments ADD COLUMN IF NOT EXISTS booking_status VARCHAR(20) DEFAULT 'pending'
      `);
    }
    console.log("Booking status column ready");
  } catch (error) {
    console.error("Failed to ensure booking_status column:", error);
  }
}

export async function ensureBaileysSessionTable(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      await connection.query(`
        CREATE TABLE IF NOT EXISTS baileys_sessions (
          id VARCHAR(64) NOT NULL PRIMARY KEY,
          data LONGTEXT NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
        )
      `);
      connection.release();
    } else {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS baileys_sessions (
          id VARCHAR(64) NOT NULL PRIMARY KEY,
          data TEXT NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
        )
      `);
    }
    console.log("Baileys sessions table ready");
  } catch (error) {
    console.error("Failed to ensure baileys_sessions table:", error);
  }
}

export async function ensureSalonPaymentsTable(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      await connection.query(`
        CREATE TABLE IF NOT EXISTS salon_payments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          amount DOUBLE NOT NULL,
          note TEXT,
          collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
        )
      `);
      connection.release();
    } else {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS salon_payments (
          id SERIAL PRIMARY KEY,
          amount DOUBLE PRECISION NOT NULL,
          note TEXT,
          collected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
        )
      `);
    }
    console.log("Salon payments table ready");
  } catch (error) {
    console.error("Failed to ensure salon_payments table:", error);
  }
}

// ── Bot client memory ─────────────────────────────────────────────────────────

export interface BotClientMemory {
  jid: string;
  phone?: string | null;       // real phone number (resolved from @s.whatsapp.net or appointment lookup)
  clientName?: string | null;
  language: string;            // 'arabic' | 'french' | 'darija' | 'unknown'
  preferredServices: string[]; // service names the client has asked about
  personalityNotes?: string | null;
  convHistory: { role: "user" | "model"; text: string }[];
  visitCount: number;
  lastSeen: Date | null;
  botBlocked?: boolean;        // true = bot will not reply to this conversation
}

export async function ensureBotMemoryTable(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      await connection.query(`
        CREATE TABLE IF NOT EXISTS bot_client_memory (
          jid            VARCHAR(100)  NOT NULL PRIMARY KEY,
          client_name    VARCHAR(255),
          language       VARCHAR(20)   NOT NULL DEFAULT 'unknown',
          preferred_services LONGTEXT,
          personality_notes  TEXT,
          conv_history   LONGTEXT,
          visit_count    INT           NOT NULL DEFAULT 1,
          last_seen      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
          created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP NOT NULL
        )
      `);
      connection.release();
    } else {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS bot_client_memory (
          jid                VARCHAR(100)  NOT NULL PRIMARY KEY,
          client_name        VARCHAR(255),
          language           VARCHAR(20)   NOT NULL DEFAULT 'unknown',
          preferred_services TEXT,
          personality_notes  TEXT,
          conv_history       TEXT,
          visit_count        INT           NOT NULL DEFAULT 1,
          last_seen          TIMESTAMP     DEFAULT CURRENT_TIMESTAMP NOT NULL,
          created_at         TIMESTAMP     DEFAULT CURRENT_TIMESTAMP NOT NULL
        )
      `);
    }
    console.log("Bot client memory table ready");
  } catch (error) {
    console.error("Failed to ensure bot_client_memory table:", error);
  }
}

export async function ensureBotMemoryPhoneColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [cols] = await connection.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bot_client_memory' AND COLUMN_NAME = 'phone'`
      );
      if ((cols as any[]).length === 0) {
        await connection.query(`ALTER TABLE bot_client_memory ADD COLUMN phone VARCHAR(30) NULL AFTER jid`);
      }
      connection.release();
    } else {
      const res = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'bot_client_memory' AND column_name = 'phone'`
      );
      if (res.rows.length === 0) {
        await pool.query(`ALTER TABLE bot_client_memory ADD COLUMN phone VARCHAR(30) NULL`);
      }
    }
    console.log("Bot memory phone column ready");
  } catch (error) {
    console.error("Failed to ensure bot_client_memory phone column:", error);
  }
}

export async function ensureBotBlockedColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [cols] = await connection.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bot_client_memory' AND COLUMN_NAME = 'bot_blocked'`
      );
      if ((cols as any[]).length === 0) {
        await connection.query(`ALTER TABLE bot_client_memory ADD COLUMN bot_blocked TINYINT(1) NOT NULL DEFAULT 0`);
        console.log("Added bot_blocked column to bot_client_memory");
      }
      connection.release();
    } else {
      const res = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'bot_client_memory' AND column_name = 'bot_blocked'`
      );
      if (res.rows.length === 0) {
        await pool.query(`ALTER TABLE bot_client_memory ADD COLUMN bot_blocked BOOLEAN NOT NULL DEFAULT FALSE`);
        console.log("Added bot_blocked column to bot_client_memory");
      }
    }
    console.log("Bot blocked column ready");
  } catch (error) {
    console.error("Failed to ensure bot_blocked column:", error);
  }
}

export async function getBotMemory(jid: string): Promise<BotClientMemory | null> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(
        `SELECT * FROM bot_client_memory WHERE jid = ?`, [jid]
      );
      connection.release();
      const row = (rows as any[])[0];
      if (!row) return null;
      return {
        jid: row.jid,
        phone: row.phone ?? null,
        clientName: row.client_name ?? null,
        language: row.language || 'unknown',
        preferredServices: row.preferred_services
          ? (typeof row.preferred_services === 'string'
              ? JSON.parse(row.preferred_services)
              : row.preferred_services)
          : [],
        personalityNotes: row.personality_notes ?? null,
        convHistory: row.conv_history ? JSON.parse(row.conv_history) : [],
        visitCount: row.visit_count || 1,
        lastSeen: row.last_seen ? new Date(row.last_seen) : null,
        botBlocked: row.bot_blocked === 1 || row.bot_blocked === true,
      };
    } else {
      const result = await pool.query(
        `SELECT * FROM bot_client_memory WHERE jid = $1`, [jid]
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        jid: row.jid,
        phone: row.phone ?? null,
        clientName: row.client_name ?? null,
        language: row.language || 'unknown',
        preferredServices: row.preferred_services
          ? (typeof row.preferred_services === 'string'
              ? JSON.parse(row.preferred_services)
              : row.preferred_services)
          : [],
        personalityNotes: row.personality_notes ?? null,
        convHistory: row.conv_history ? JSON.parse(row.conv_history) : [],
        visitCount: row.visit_count || 1,
        lastSeen: row.last_seen ? new Date(row.last_seen) : null,
        botBlocked: row.bot_blocked === true,
      };
    }
  } catch (err) {
    console.error("[BotMemory] getBotMemory failed for", jid, err);
    return null;
  }
}

export async function saveBotMemory(mem: BotClientMemory): Promise<void> {
  try {
    const servicesJson = JSON.stringify(mem.preferredServices || []);
    const historyJson  = JSON.stringify(mem.convHistory || []);
    const botBlocked   = mem.botBlocked ? 1 : 0;
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      try {
        await connection.query(
          `INSERT INTO bot_client_memory
             (jid, phone, client_name, language, preferred_services, personality_notes, conv_history, visit_count, last_seen, bot_blocked)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
           ON DUPLICATE KEY UPDATE
             phone              = COALESCE(VALUES(phone), phone),
             client_name        = COALESCE(VALUES(client_name), client_name),
             language           = VALUES(language),
             preferred_services = VALUES(preferred_services),
             personality_notes  = COALESCE(VALUES(personality_notes), personality_notes),
             conv_history       = VALUES(conv_history),
             visit_count        = VALUES(visit_count),
             bot_blocked        = VALUES(bot_blocked),
             last_seen          = NOW()`,
          [
            mem.jid,
            mem.phone || null,
            mem.clientName || null,
            mem.language,
            servicesJson,
            mem.personalityNotes || null,
            historyJson,
            mem.visitCount,
            botBlocked,
          ]
        );
      } finally {
        connection.release();
      }
    } else {
      await pool.query(
        `INSERT INTO bot_client_memory
           (jid, phone, client_name, language, preferred_services, personality_notes, conv_history, visit_count, last_seen, bot_blocked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
         ON CONFLICT (jid) DO UPDATE SET
           phone              = COALESCE(EXCLUDED.phone, bot_client_memory.phone),
           client_name        = COALESCE(EXCLUDED.client_name, bot_client_memory.client_name),
           language           = EXCLUDED.language,
           preferred_services = EXCLUDED.preferred_services,
           personality_notes  = COALESCE(EXCLUDED.personality_notes, bot_client_memory.personality_notes),
           conv_history       = EXCLUDED.conv_history,
           visit_count        = EXCLUDED.visit_count,
           bot_blocked        = EXCLUDED.bot_blocked,
           last_seen          = NOW()`,
        [
          mem.jid,
          mem.phone || null,
          mem.clientName || null,
          mem.language,
          servicesJson,
          mem.personalityNotes || null,
          historyJson,
          mem.visitCount,
          mem.botBlocked ?? false,
        ]
      );
    }
  } catch (err) {
    console.error("[BotMemory] saveBotMemory failed for", mem.jid, err);
  }
}

/**
 * Find all bot memory entries whose stored phone matches the given normalised phone number.
 * Used to locate @lid JIDs when silencing after a staff-side booking confirmation.
 */
export async function getBotMemoriesByPhone(normalizedPhone: string): Promise<BotClientMemory[]> {
  if (!normalizedPhone) return [];
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(
        `SELECT * FROM bot_client_memory WHERE phone = ?`, [normalizedPhone]
      );
      connection.release();
      return (rows as any[]).map((row) => ({
        jid: row.jid,
        phone: row.phone ?? null,
        clientName: row.client_name ?? null,
        language: row.language || 'unknown',
        preferredServices: row.preferred_services
          ? (typeof row.preferred_services === 'string' ? JSON.parse(row.preferred_services) : row.preferred_services)
          : [],
        personalityNotes: row.personality_notes ?? null,
        convHistory: row.conv_history ? JSON.parse(row.conv_history) : [],
        visitCount: row.visit_count || 1,
        lastSeen: row.last_seen ? new Date(row.last_seen) : null,
        botBlocked: row.bot_blocked === 1 || row.bot_blocked === true,
      }));
    } else {
      const result = await pool.query(
        `SELECT * FROM bot_client_memory WHERE phone = $1`, [normalizedPhone]
      );
      return result.rows.map((row: any) => ({
        jid: row.jid,
        phone: row.phone ?? null,
        clientName: row.client_name ?? null,
        language: row.language || 'unknown',
        preferredServices: row.preferred_services
          ? (typeof row.preferred_services === 'string' ? JSON.parse(row.preferred_services) : row.preferred_services)
          : [],
        personalityNotes: row.personality_notes ?? null,
        convHistory: row.conv_history ? JSON.parse(row.conv_history) : [],
        visitCount: row.visit_count || 1,
        lastSeen: row.last_seen ? new Date(row.last_seen) : null,
        botBlocked: row.bot_blocked === true,
      }));
    }
  } catch (err) {
    console.error("[BotMemory] getBotMemoriesByPhone failed for", normalizedPhone, err);
    return [];
  }
}

function _mapBotMemoryRow(row: any, dialect: 'mysql' | 'postgres'): BotClientMemory {
  return {
    jid: row.jid,
    phone: row.phone ?? null,
    clientName: row.client_name ?? null,
    language: row.language || 'unknown',
    preferredServices: row.preferred_services
      ? (typeof row.preferred_services === 'string' ? JSON.parse(row.preferred_services) : row.preferred_services)
      : [],
    personalityNotes: row.personality_notes ?? null,
    convHistory: row.conv_history ? JSON.parse(row.conv_history) : [],
    visitCount: row.visit_count || 0,
    lastSeen: row.last_seen ? new Date(row.last_seen) : null,
    botBlocked: dialect === 'mysql'
      ? (row.bot_blocked === 1 || row.bot_blocked === true)
      : row.bot_blocked === true,
  };
}

/** Returns the 100 most-recent bot memories — used by the UI conversation panel. */
export async function getAllBotMemories(): Promise<BotClientMemory[]> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(
        `SELECT * FROM bot_client_memory ORDER BY last_seen DESC LIMIT 100`
      );
      connection.release();
      return (rows as any[]).map((r) => _mapBotMemoryRow(r, 'mysql'));
    } else {
      const result = await pool.query(
        `SELECT * FROM bot_client_memory ORDER BY last_seen DESC LIMIT 100`
      );
      return result.rows.map((r: any) => _mapBotMemoryRow(r, 'postgres'));
    }
  } catch (err) {
    console.error("[BotMemory] getAllBotMemories failed:", err);
    return [];
  }
}

/** Returns ALL bot memories — no LIMIT — used only by the client sync endpoint. */
export async function getAllBotMemoriesAll(): Promise<BotClientMemory[]> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(
        `SELECT * FROM bot_client_memory ORDER BY last_seen DESC`
      );
      connection.release();
      return (rows as any[]).map((r) => _mapBotMemoryRow(r, 'mysql'));
    } else {
      const result = await pool.query(
        `SELECT * FROM bot_client_memory ORDER BY last_seen DESC`
      );
      return result.rows.map((r: any) => _mapBotMemoryRow(r, 'postgres'));
    }
  } catch (err) {
    console.error("[BotMemory] getAllBotMemoriesAll failed:", err);
    return [];
  }
}

export async function ensureMapsLinkColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'business_settings' AND COLUMN_NAME = 'maps_link'
      `);
      if ((rows as any[]).length === 0) {
        await connection.query(`ALTER TABLE business_settings ADD COLUMN maps_link TEXT NULL`);
        console.log("Added maps_link column to business_settings table");
      }
      connection.release();
    } else {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_settings' AND column_name = 'maps_link') THEN
            ALTER TABLE business_settings ADD COLUMN maps_link TEXT NULL;
          END IF;
        END $$;
      `);
    }
    console.log("maps_link column ready");
  } catch (error) {
    console.error("Failed to ensure maps_link column:", error);
  }
}

export async function ensureBotEnabledColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'business_settings' AND COLUMN_NAME = 'bot_enabled'
      `);
      if ((rows as any[]).length === 0) {
        await connection.query(`ALTER TABLE business_settings ADD COLUMN bot_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
        console.log("Added bot_enabled column to business_settings table");
      }
      connection.release();
    } else {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_settings' AND column_name = 'bot_enabled') THEN
            ALTER TABLE business_settings ADD COLUMN bot_enabled BOOLEAN NOT NULL DEFAULT TRUE;
          END IF;
        END $$;
      `);
    }
    console.log("Bot enabled column ready");
  } catch (error) {
    console.error("Failed to ensure bot_enabled column:", error);
  }
}

export async function ensureBotFilterColumns(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      // Must filter by TABLE_SCHEMA = DATABASE() to avoid matching columns from
      // other databases on the same TiDB Cloud server (which would cause the
      // migration to think the column exists when it doesn't in our DB).
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'business_settings'
          AND COLUMN_NAME = 'bot_filter_mode'
      `);
      if ((rows as any[]).length === 0) {
        await connection.query(`ALTER TABLE business_settings ADD COLUMN bot_filter_mode VARCHAR(20) NOT NULL DEFAULT 'all'`);
        await connection.query(`ALTER TABLE business_settings ADD COLUMN bot_filter_numbers TEXT`);
        console.log("Added bot filter columns to business_settings");
      }
      // Also ensure bot_filter_numbers exists (may have been missed on first run)
      const [numRows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'business_settings'
          AND COLUMN_NAME = 'bot_filter_numbers'
      `);
      if ((numRows as any[]).length === 0) {
        await connection.query(`ALTER TABLE business_settings ADD COLUMN bot_filter_numbers TEXT`);
        console.log("Added bot_filter_numbers column to business_settings");
      }
      connection.release();
    } else {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_settings' AND column_name = 'bot_filter_mode') THEN
            ALTER TABLE business_settings ADD COLUMN bot_filter_mode VARCHAR(20) NOT NULL DEFAULT 'all';
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_settings' AND column_name = 'bot_filter_numbers') THEN
            ALTER TABLE business_settings ADD COLUMN bot_filter_numbers TEXT;
          END IF;
        END $$;
      `);
    }
    console.log("Bot filter columns ready");
  } catch (error) {
    console.error("Failed to ensure bot filter columns:", error);
  }
}

export async function ensureBotSilenceAfterBookingColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'business_settings'
          AND COLUMN_NAME = 'bot_silence_after_booking'
      `);
      if ((rows as any[]).length === 0) {
        await connection.query(`ALTER TABLE business_settings ADD COLUMN bot_silence_after_booking BOOLEAN NOT NULL DEFAULT TRUE`);
        console.log("Added bot_silence_after_booking column to business_settings");
      }
      connection.release();
    } else {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_settings' AND column_name = 'bot_silence_after_booking') THEN
            ALTER TABLE business_settings ADD COLUMN bot_silence_after_booking BOOLEAN NOT NULL DEFAULT TRUE;
          END IF;
        END $$;
      `);
    }
    console.log("Bot silence after booking column ready");
  } catch (error) {
    console.error("Failed to ensure bot_silence_after_booking column:", error);
  }
}

export async function ensureDailySummaryColumns(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'business_settings'
          AND COLUMN_NAME = 'owner_phone'
      `);
      if ((rows as any[]).length === 0) {
        await connection.query(`ALTER TABLE business_settings ADD COLUMN owner_phone VARCHAR(50)`);
        await connection.query(`ALTER TABLE business_settings ADD COLUMN daily_summary_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
        await connection.query(`ALTER TABLE business_settings ADD COLUMN daily_summary_time VARCHAR(10) NOT NULL DEFAULT '20:00'`);
        console.log("Added daily summary columns to business_settings");
      }
      connection.release();
    } else {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_settings' AND column_name = 'owner_phone') THEN
            ALTER TABLE business_settings ADD COLUMN owner_phone VARCHAR(50);
            ALTER TABLE business_settings ADD COLUMN daily_summary_enabled BOOLEAN NOT NULL DEFAULT FALSE;
            ALTER TABLE business_settings ADD COLUMN daily_summary_time VARCHAR(10) NOT NULL DEFAULT '20:00';
          END IF;
        END $$;
      `);
    }
    console.log("Daily summary columns ready");
  } catch (error) {
    console.error("Failed to ensure daily summary columns:", error);
  }
}

export async function ensureOwnerWithdrawalsNotesColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'owner_withdrawals'
          AND COLUMN_NAME = 'notes'
      `);
      if ((rows as any[]).length === 0) {
        await connection.query(`ALTER TABLE owner_withdrawals ADD COLUMN notes TEXT`);
        console.log("Added notes column to owner_withdrawals");
      }
      connection.release();
    } else {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'owner_withdrawals' AND column_name = 'notes') THEN
            ALTER TABLE owner_withdrawals ADD COLUMN notes TEXT;
          END IF;
        END $$;
      `);
    }
    console.log("Owner withdrawals notes column ready");
  } catch (error) {
    console.error("Failed to ensure owner_withdrawals notes column:", error);
  }
}

export async function ensureTtsVoiceColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'business_settings' AND COLUMN_NAME = 'tts_voice'
      `);
      if ((rows as any[]).length === 0) {
        await connection.query(`ALTER TABLE business_settings ADD COLUMN tts_voice VARCHAR(50) NOT NULL DEFAULT 'Aoede'`);
        console.log("Added tts_voice column to business_settings table");
      }
      connection.release();
    } else {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_settings' AND column_name = 'tts_voice') THEN
            ALTER TABLE business_settings ADD COLUMN tts_voice VARCHAR(50) NOT NULL DEFAULT 'Aoede';
          END IF;
        END $$;
      `);
    }
    console.log("TTS voice column ready");
  } catch (error) {
    console.error("Failed to ensure tts_voice column:", error);
  }
}

export async function ensureTtsEnabledColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'business_settings' AND COLUMN_NAME = 'tts_enabled'
      `);
      if ((rows as any[]).length === 0) {
        await connection.query(`ALTER TABLE business_settings ADD COLUMN tts_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
        console.log("Added tts_enabled column to business_settings table");
      }
      connection.release();
    } else {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_settings' AND column_name = 'tts_enabled') THEN
            ALTER TABLE business_settings ADD COLUMN tts_enabled BOOLEAN NOT NULL DEFAULT TRUE;
          END IF;
        END $$;
      `);
    }
    console.log("TTS enabled column ready");
  } catch (error) {
    console.error("Failed to ensure tts_enabled column:", error);
  }
}

export async function ensureTtsSpeedColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'business_settings' AND COLUMN_NAME = 'tts_speed'
      `);
      if ((rows as any[]).length === 0) {
        await connection.query(`ALTER TABLE business_settings ADD COLUMN tts_speed FLOAT NOT NULL DEFAULT 1.0`);
        console.log("Added tts_speed column to business_settings table");
      }
      connection.release();
    } else {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_settings' AND column_name = 'tts_speed') THEN
            ALTER TABLE business_settings ADD COLUMN tts_speed REAL NOT NULL DEFAULT 1.0;
          END IF;
        END $$;
      `);
    }
    console.log("TTS speed column ready");
  } catch (error) {
    console.error("Failed to ensure tts_speed column:", error);
  }
}

export async function ensureCategoriesColorColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'categories' AND COLUMN_NAME = 'color'
      `);
      if ((rows as any[]).length === 0) {
        await connection.query(`ALTER TABLE categories ADD COLUMN color VARCHAR(50) NULL`);
        console.log("Added color column to categories table");
      }
      connection.release();
    } else {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'categories' AND column_name = 'color') THEN
            ALTER TABLE categories ADD COLUMN color VARCHAR(50);
          END IF;
        END $$;
      `);
    }
    console.log("Categories color column ready");
  } catch (error) {
    console.error("Failed to ensure categories color column:", error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SALON COMPLAINTS — shared across all clients
// ─────────────────────────────────────────────────────────────────────────────

export interface SalonComplaint {
  id: number;
  complaintText: string;
  complaintType: "complaint" | "bot_error"; // complaint = salon issue; bot_error = bot gave wrong info
  sourceJid: string;
  sourcePhone?: string | null;
  clientName?: string | null;
  detectedAt: Date;
  isResolved: boolean;
  fixNote?: string | null;
  resolvedAt?: Date | null;
}

export async function ensureSalonComplaintsTable(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      await connection.query(`
        CREATE TABLE IF NOT EXISTS salon_complaints (
          id            INT AUTO_INCREMENT PRIMARY KEY,
          complaint_text TEXT NOT NULL,
          source_jid    VARCHAR(100) NOT NULL,
          source_phone  VARCHAR(30),
          client_name   VARCHAR(255),
          is_resolved   TINYINT(1) NOT NULL DEFAULT 0,
          fix_note      TEXT,
          resolved_at   TIMESTAMP NULL,
          detected_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
        )
      `);
      connection.release();
    } else {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS salon_complaints (
          id            SERIAL PRIMARY KEY,
          complaint_text TEXT NOT NULL,
          source_jid    VARCHAR(100) NOT NULL,
          source_phone  VARCHAR(30),
          client_name   VARCHAR(255),
          is_resolved   BOOLEAN NOT NULL DEFAULT FALSE,
          fix_note      TEXT,
          resolved_at   TIMESTAMP,
          detected_at   TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
    }
    console.log("Salon complaints table ready");
  } catch (error) {
    console.error("Failed to ensure salon_complaints table:", error);
  }
}

export async function ensureComplaintTypeColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      await connection.query(`
        ALTER TABLE salon_complaints
        ADD COLUMN IF NOT EXISTS complaint_type VARCHAR(20) NOT NULL DEFAULT 'complaint'
      `).catch(() => { /* column may already exist */ });
      connection.release();
    } else {
      await pool.query(`
        ALTER TABLE salon_complaints
        ADD COLUMN IF NOT EXISTS complaint_type VARCHAR(20) NOT NULL DEFAULT 'complaint'
      `).catch(() => {});
    }
    console.log("Complaint type column ready");
  } catch (error) {
    console.error("Failed to ensure complaint_type column:", error);
  }
}

export async function saveSalonComplaint(c: {
  complaintText: string;
  complaintType?: "complaint" | "bot_error";
  sourceJid: string;
  sourcePhone?: string | null;
  clientName?: string | null;
  isResolved?: boolean;
  fixNote?: string | null;
}): Promise<void> {
  const type = c.complaintType || "complaint";
  const resolved = c.isResolved ? 1 : 0;
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      try {
        await connection.query(
          `INSERT INTO salon_complaints (complaint_text, complaint_type, source_jid, source_phone, client_name, is_resolved, fix_note, resolved_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            c.complaintText, type,
            c.sourceJid, c.sourcePhone || null, c.clientName || null,
            resolved, c.fixNote || null,
            c.isResolved ? new Date() : null,
          ]
        );
      } finally {
        connection.release();
      }
    } else {
      await pool.query(
        `INSERT INTO salon_complaints (complaint_text, complaint_type, source_jid, source_phone, client_name, is_resolved, fix_note, resolved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          c.complaintText, type,
          c.sourceJid, c.sourcePhone || null, c.clientName || null,
          c.isResolved || false, c.fixNote || null,
          c.isResolved ? new Date() : null,
        ]
      );
    }
  } catch (err) {
    console.error("[SalonComplaints] saveSalonComplaint failed:", err);
  }
}

export async function getSalonComplaints(): Promise<SalonComplaint[]> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(
        `SELECT * FROM salon_complaints ORDER BY detected_at DESC LIMIT 200`
      );
      connection.release();
      return (rows as any[]).map(rowToComplaint);
    } else {
      const result = await pool.query(
        `SELECT * FROM salon_complaints ORDER BY detected_at DESC LIMIT 200`
      );
      return result.rows.map(rowToComplaint);
    }
  } catch (err) {
    console.error("[SalonComplaints] getSalonComplaints failed:", err);
    return [];
  }
}

export async function getResolvedComplaints(): Promise<SalonComplaint[]> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(
        `SELECT * FROM salon_complaints WHERE is_resolved = 1 AND fix_note IS NOT NULL ORDER BY resolved_at DESC LIMIT 50`
      );
      connection.release();
      return (rows as any[]).map(rowToComplaint);
    } else {
      const result = await pool.query(
        `SELECT * FROM salon_complaints WHERE is_resolved = TRUE AND fix_note IS NOT NULL ORDER BY resolved_at DESC LIMIT 50`
      );
      return result.rows.map(rowToComplaint);
    }
  } catch (err) {
    console.error("[SalonComplaints] getResolvedComplaints failed:", err);
    return [];
  }
}

export async function resolveComplaint(id: number, fixNote: string): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      await connection.query(
        `UPDATE salon_complaints SET is_resolved = 1, fix_note = ?, resolved_at = NOW() WHERE id = ?`,
        [fixNote, id]
      );
      connection.release();
    } else {
      await pool.query(
        `UPDATE salon_complaints SET is_resolved = TRUE, fix_note = $1, resolved_at = NOW() WHERE id = $2`,
        [fixNote, id]
      );
    }
  } catch (err) {
    console.error("[SalonComplaints] resolveComplaint failed:", err);
  }
}

export async function deleteSalonComplaint(id: number): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      await connection.query(`DELETE FROM salon_complaints WHERE id = ?`, [id]);
      connection.release();
    } else {
      await pool.query(`DELETE FROM salon_complaints WHERE id = $1`, [id]);
    }
  } catch (err) {
    console.error("[SalonComplaints] deleteSalonComplaint failed:", err);
  }
}

function rowToComplaint(row: any): SalonComplaint {
  return {
    id: row.id,
    complaintText: row.complaint_text,
    complaintType: (row.complaint_type === "bot_error" ? "bot_error" : "complaint") as "complaint" | "bot_error",
    sourceJid: row.source_jid,
    sourcePhone: row.source_phone ?? null,
    clientName: row.client_name ?? null,
    detectedAt: new Date(row.detected_at),
    isResolved: row.is_resolved === 1 || row.is_resolved === true,
    fixNote: row.fix_note ?? null,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
  };
}

export async function ensureStaffGenderColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query(`
          SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff' AND COLUMN_NAME = 'gender'
        `);
        if ((rows as any[]).length === 0) {
          await connection.query(`ALTER TABLE staff ADD COLUMN gender VARCHAR(10) NOT NULL DEFAULT 'female'`);
          console.log("Added gender column to staff");
        }
      } finally {
        connection.release();
      }
    } else {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'staff' AND column_name = 'gender') THEN
            ALTER TABLE staff ADD COLUMN gender VARCHAR(10) NOT NULL DEFAULT 'female';
          END IF;
        END $$;
      `);
    }
    console.log("Staff gender column ready");
  } catch (error) {
    console.error("Failed to ensure staff gender column:", error);
  }
}

export async function ensureBossInstructionsColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query(`
          SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'business_settings' AND COLUMN_NAME = 'boss_instructions'
        `);
        if ((rows as any[]).length === 0) {
          await connection.query(`ALTER TABLE business_settings ADD COLUMN boss_instructions TEXT NULL`);
          console.log("Added boss_instructions column to business_settings");
        }
      } finally {
        connection.release();
      }
    } else {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_settings' AND column_name = 'boss_instructions') THEN
            ALTER TABLE business_settings ADD COLUMN boss_instructions TEXT NULL;
          END IF;
        END $$;
      `);
    }
    console.log("Boss instructions column ready");
  } catch (error) {
    console.error("Failed to ensure boss_instructions column:", error);
  }
}

export async function ensureLinaPersonalityColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query(`
          SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'business_settings' AND COLUMN_NAME = 'lina_personality'
        `);
        if ((rows as any[]).length === 0) {
          await connection.query(`ALTER TABLE business_settings ADD COLUMN lina_personality TEXT NULL`);
          await connection.query(`UPDATE business_settings SET lina_personality = '["warm"]' WHERE lina_personality IS NULL`);
          console.log("Added lina_personality column to business_settings");
        }
      } finally {
        connection.release();
      }
    } else {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_settings' AND column_name = 'lina_personality') THEN
            ALTER TABLE business_settings ADD COLUMN lina_personality TEXT DEFAULT '["warm"]';
          END IF;
        END $$;
      `);
    }
    console.log("Wissal personality column ready");
  } catch (error) {
    console.error("Failed to ensure lina_personality column:", error);
  }
}

export async function getBossInstructions(): Promise<string[]> {
  try {
    let raw: string | null = null;
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      const [rows] = await connection.query(`SELECT boss_instructions FROM business_settings LIMIT 1`);
      connection.release();
      raw = (rows as any[])[0]?.boss_instructions ?? null;
    } else {
      const result = await pool.query(`SELECT boss_instructions FROM business_settings LIMIT 1`);
      raw = result.rows[0]?.boss_instructions ?? null;
    }
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export async function saveBossInstructions(instructions: string[]): Promise<void> {
  const json = JSON.stringify(instructions);
  if (dbDialect === 'mysql') {
    const connection = await pool.getConnection();
    await connection.query(`UPDATE business_settings SET boss_instructions = ? LIMIT 1`, [json]);
    connection.release();
  } else {
    await pool.query(`UPDATE business_settings SET boss_instructions = $1`, [json]);
  }
}

export async function ensureStaffGenderDefaults(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      try {
        await connection.query(`UPDATE staff SET gender = 'male' WHERE LOWER(name) IN ('mehdi','mohammed','karim','youssef','omar','hassan','adam','amine') AND gender = 'female'`);
      } finally {
        connection.release();
      }
    } else {
      await pool.query(`UPDATE staff SET gender = 'male' WHERE LOWER(name) IN ('mehdi','mohammed','karim','youssef','omar','hassan','adam','amine') AND gender = 'female'`);
    }
    console.log("Staff gender defaults applied");
  } catch (error) {
    console.error("Failed to apply staff gender defaults:", error);
  }
}

export async function ensurePrivateRoomColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query(`
          SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'private_room'
        `);
        if ((rows as any[]).length === 0) {
          await connection.query(`ALTER TABLE appointments ADD COLUMN private_room TINYINT(1) NOT NULL DEFAULT 0`);
          console.log("Added private_room column to appointments");
        }
      } finally {
        connection.release();
      }
    } else {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'private_room') THEN
            ALTER TABLE appointments ADD COLUMN private_room BOOLEAN NOT NULL DEFAULT FALSE;
          END IF;
        END $$;
      `);
    }
    console.log("Private room column ready");
  } catch (error) {
    console.error("Failed to ensure private_room column:", error);
  }
}

export async function ensureOwnerWithdrawalsTable(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      await connection.query(`
        CREATE TABLE IF NOT EXISTS owner_withdrawals (
          id INT AUTO_INCREMENT PRIMARY KEY,
          amount DOUBLE NOT NULL,
          date TEXT NOT NULL,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
        )
      `);
      connection.release();
    } else {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS owner_withdrawals (
          id SERIAL PRIMARY KEY,
          amount DOUBLE PRECISION NOT NULL,
          date TEXT NOT NULL,
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        )
      `);
    }
    console.log("Owner withdrawals table ready");
  } catch (error) {
    console.error("Failed to ensure owner_withdrawals table:", error);
  }
}

// Comprehensive migration: add ALL missing columns to the staff table (Postgres only)
export async function ensureStaffColumnsPostgres(): Promise<void> {
  if (dbDialect === 'mysql') return;
  try {
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='staff' AND column_name='photo_url') THEN
          ALTER TABLE staff ADD COLUMN photo_url TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='staff' AND column_name='categories') THEN
          ALTER TABLE staff ADD COLUMN categories TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='staff' AND column_name='public_token') THEN
          ALTER TABLE staff ADD COLUMN public_token TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='staff' AND column_name='gender') THEN
          ALTER TABLE staff ADD COLUMN gender VARCHAR(10) NOT NULL DEFAULT 'female';
        END IF;
      END $$;
    `);
    console.log("Staff columns ready (Postgres)");
  } catch (error) {
    console.error("Failed to ensure staff columns (Postgres):", error);
  }
}

// Compatibility alias for index.ts import
export const ensureStaffPhotoUrlColumn = ensureStaffColumnsPostgres;

// Comprehensive migration: add ALL possibly-missing columns across all tables (Postgres only)
export async function ensureLoyaltyColumnsInSettings(): Promise<void> {
  if (dbDialect === 'mysql') return;
  try {
    // --- business_settings ---
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='maps_link') THEN ALTER TABLE business_settings ADD COLUMN maps_link TEXT; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='logo') THEN ALTER TABLE business_settings ADD COLUMN logo TEXT; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='address') THEN ALTER TABLE business_settings ADD COLUMN address TEXT; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='phone') THEN ALTER TABLE business_settings ADD COLUMN phone VARCHAR(50); END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='email') THEN ALTER TABLE business_settings ADD COLUMN email VARCHAR(255); END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='working_days') THEN ALTER TABLE business_settings ADD COLUMN working_days JSONB NOT NULL DEFAULT '[1,2,3,4,5,6]'; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='loyalty_enabled') THEN ALTER TABLE business_settings ADD COLUMN loyalty_enabled BOOLEAN NOT NULL DEFAULT TRUE; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='loyalty_points_per_dh') THEN ALTER TABLE business_settings ADD COLUMN loyalty_points_per_dh INTEGER NOT NULL DEFAULT 1; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='loyalty_points_value') THEN ALTER TABLE business_settings ADD COLUMN loyalty_points_value DOUBLE PRECISION NOT NULL DEFAULT 0.1; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='referral_bonus_points') THEN ALTER TABLE business_settings ADD COLUMN referral_bonus_points INTEGER NOT NULL DEFAULT 100; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='referral_bonus_referee') THEN ALTER TABLE business_settings ADD COLUMN referral_bonus_referee INTEGER NOT NULL DEFAULT 50; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='cancellation_hours') THEN ALTER TABLE business_settings ADD COLUMN cancellation_hours INTEGER NOT NULL DEFAULT 24; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='auto_lock_enabled') THEN ALTER TABLE business_settings ADD COLUMN auto_lock_enabled BOOLEAN NOT NULL DEFAULT FALSE; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='planning_shortcuts') THEN ALTER TABLE business_settings ADD COLUMN planning_shortcuts JSONB NOT NULL DEFAULT '["services","clients","salaries","inventory"]'; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='tts_voice') THEN ALTER TABLE business_settings ADD COLUMN tts_voice VARCHAR(50) NOT NULL DEFAULT 'Aoede'; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='tts_enabled') THEN ALTER TABLE business_settings ADD COLUMN tts_enabled BOOLEAN NOT NULL DEFAULT TRUE; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='lina_personality') THEN ALTER TABLE business_settings ADD COLUMN lina_personality TEXT NOT NULL DEFAULT '["warm"]'; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='bot_enabled') THEN ALTER TABLE business_settings ADD COLUMN bot_enabled BOOLEAN NOT NULL DEFAULT TRUE; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='bot_filter_mode') THEN ALTER TABLE business_settings ADD COLUMN bot_filter_mode VARCHAR(20) NOT NULL DEFAULT 'all'; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='bot_filter_numbers') THEN ALTER TABLE business_settings ADD COLUMN bot_filter_numbers TEXT; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='boss_instructions') THEN ALTER TABLE business_settings ADD COLUMN boss_instructions TEXT; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_settings' AND column_name='planning_slot_height') THEN ALTER TABLE business_settings ADD COLUMN planning_slot_height INTEGER NOT NULL DEFAULT 44; END IF;
      END $$;
    `);
    console.log("Business settings columns ready (Postgres)");
  } catch (error) {
    console.error("Failed to ensure business_settings columns:", error);
  }

  try {
    // --- services ---
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='linked_product_ids') THEN ALTER TABLE services ADD COLUMN linked_product_ids JSONB DEFAULT '[]'; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='loyalty_points_multiplier') THEN ALTER TABLE services ADD COLUMN loyalty_points_multiplier INTEGER NOT NULL DEFAULT 1; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='is_starting_price') THEN ALTER TABLE services ADD COLUMN is_starting_price BOOLEAN NOT NULL DEFAULT FALSE; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='max_price') THEN ALTER TABLE services ADD COLUMN max_price DOUBLE PRECISION; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='emoji') THEN ALTER TABLE services ADD COLUMN emoji VARCHAR(10); END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='services' AND column_name='image_url') THEN ALTER TABLE services ADD COLUMN image_url TEXT; END IF;
      END $$;
    `);
    console.log("Services columns ready (Postgres)");
  } catch (error) {
    console.error("Failed to ensure services columns:", error);
  }

  try {
    // --- clients ---
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='loyalty_points') THEN ALTER TABLE clients ADD COLUMN loyalty_points INTEGER NOT NULL DEFAULT 0; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='loyalty_enrolled') THEN ALTER TABLE clients ADD COLUMN loyalty_enrolled BOOLEAN NOT NULL DEFAULT FALSE; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='use_points') THEN ALTER TABLE clients ADD COLUMN use_points BOOLEAN NOT NULL DEFAULT FALSE; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='gift_card_balance') THEN ALTER TABLE clients ADD COLUMN gift_card_balance DOUBLE PRECISION NOT NULL DEFAULT 0; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='use_gift_card_balance') THEN ALTER TABLE clients ADD COLUMN use_gift_card_balance BOOLEAN NOT NULL DEFAULT FALSE; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='total_visits') THEN ALTER TABLE clients ADD COLUMN total_visits INTEGER NOT NULL DEFAULT 0; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='total_spent') THEN ALTER TABLE clients ADD COLUMN total_spent DOUBLE PRECISION NOT NULL DEFAULT 0; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='clients' AND column_name='referred_by') THEN ALTER TABLE clients ADD COLUMN referred_by INTEGER; END IF;
      END $$;
    `);
    console.log("Clients columns ready (Postgres)");
  } catch (error) {
    console.error("Failed to ensure clients columns:", error);
  }

  try {
    // --- appointments extra columns (beyond what existing ensure fns cover) ---
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='loyalty_points_earned') THEN ALTER TABLE appointments ADD COLUMN loyalty_points_earned INTEGER DEFAULT 0; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='loyalty_discount_amount') THEN ALTER TABLE appointments ADD COLUMN loyalty_discount_amount DOUBLE PRECISION DEFAULT 0; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='loyalty_points_redeemed') THEN ALTER TABLE appointments ADD COLUMN loyalty_points_redeemed INTEGER DEFAULT 0; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='gift_card_discount_amount') THEN ALTER TABLE appointments ADD COLUMN gift_card_discount_amount DOUBLE PRECISION DEFAULT 0; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='phone') THEN ALTER TABLE appointments ADD COLUMN phone TEXT; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='discount_amount') THEN ALTER TABLE appointments ADD COLUMN discount_amount DOUBLE PRECISION DEFAULT 0; END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='discount_reason') THEN ALTER TABLE appointments ADD COLUMN discount_reason TEXT; END IF;
      END $$;
    `);
    console.log("Appointments extra columns ready (Postgres)");
  } catch (error) {
    console.error("Failed to ensure appointments extra columns:", error);
  }
}

export async function ensureBusinessSettingsRow(): Promise<void> {
  try {
    const currentDb = db;
    const currentSchema = schema;
    if (!currentDb || !currentSchema?.businessSettings) {
      console.warn("ensureBusinessSettingsRow: DB not ready, skipping");
      return;
    }
    const { eq } = await import("drizzle-orm");
    const [existing] = await currentDb.select({ id: currentSchema.businessSettings.id })
      .from(currentSchema.businessSettings)
      .limit(1);
    if (!existing) {
      const defaults: any = {
        businessName: "PREGA SQUAD",
        currency: "MAD",
        currencySymbol: "DH",
        openingTime: "09:00",
        closingTime: "19:00",
        workingDays: [1, 2, 3, 4, 5, 6],
        loyaltyEnabled: true,
        loyaltyPointsPerDh: 1,
        loyaltyPointsValue: 0.1,
        referralBonusPoints: 100,
        referralBonusReferee: 50,
        cancellationHours: 24,
        autoLockEnabled: false,
        planningShortcuts: ["services", "clients", "salaries", "inventory"],
        ttsVoice: "Aoede",
        botEnabled: true,
        botFilterMode: "all",
      };
      await currentDb.insert(currentSchema.businessSettings).values(defaults);
      console.log("Business settings row created (first run)");
    } else {
      console.log("Business settings row ready");
    }
  } catch (error) {
    console.error("Failed to ensure business settings row:", error);
  }
}

export async function ensureHolidaysColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query(`
          SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'business_settings' AND COLUMN_NAME = 'holidays'
        `);
        if ((rows as any[]).length === 0) {
          // TiDB/MySQL don't support DEFAULT ('[]') expression for JSON — add nullable then fill
          await connection.query(`ALTER TABLE business_settings ADD COLUMN holidays JSON NULL`);
          await connection.query(`UPDATE business_settings SET holidays = '[]' WHERE holidays IS NULL`);
          console.log("Added holidays column to business_settings");
        }
      } finally {
        connection.release();
      }
    } else {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_settings' AND column_name = 'holidays') THEN
            ALTER TABLE business_settings ADD COLUMN holidays JSONB NOT NULL DEFAULT '[]';
          END IF;
        END $$;
      `);
    }
    console.log("Holidays column ready");
  } catch (error) {
    console.error("Failed to ensure holidays column:", error);
  }
}

// ── Broadcast logs table ──────────────────────────────────────────────────────
export async function ensureBroadcastLogsTable(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      try {
        await connection.query(`
          CREATE TABLE IF NOT EXISTS broadcast_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            message TEXT NOT NULL,
            total INT NOT NULL DEFAULT 0,
            sent INT NOT NULL DEFAULT 0,
            failed INT NOT NULL DEFAULT 0,
            sent_clients JSON NULL,
            failed_clients JSON NULL,
            started_at BIGINT NOT NULL,
            finished_at BIGINT NULL
          )
        `);
      } finally {
        connection.release();
      }
    } else {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS broadcast_logs (
          id SERIAL PRIMARY KEY,
          message TEXT NOT NULL,
          total INT NOT NULL DEFAULT 0,
          sent INT NOT NULL DEFAULT 0,
          failed INT NOT NULL DEFAULT 0,
          sent_clients JSONB NULL,
          failed_clients JSONB NULL,
          started_at BIGINT NOT NULL,
          finished_at BIGINT NULL
        )
      `);
    }
    console.log("Broadcast logs table ready");
  } catch (error) {
    console.error("Failed to ensure broadcast_logs table:", error);
  }
}

export async function saveBroadcastLog(log: {
  message: string; total: number; sent: number; failed: number;
  sentClients: any[]; failedClients: any[]; startedAt: number; finishedAt: number;
}): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      try {
        await connection.query(
          `INSERT INTO broadcast_logs (message, total, sent, failed, sent_clients, failed_clients, started_at, finished_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [log.message, log.total, log.sent, log.failed,
           JSON.stringify(log.sentClients), JSON.stringify(log.failedClients),
           log.startedAt, log.finishedAt]
        );
      } finally {
        connection.release();
      }
    } else {
      await pool.query(
        `INSERT INTO broadcast_logs (message, total, sent, failed, sent_clients, failed_clients, started_at, finished_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [log.message, log.total, log.sent, log.failed,
         JSON.stringify(log.sentClients), JSON.stringify(log.failedClients),
         log.startedAt, log.finishedAt]
      );
    }
  } catch (error) {
    console.error("Failed to save broadcast log:", error);
  }
}

export async function getLastBroadcastLog(): Promise<any | null> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query(
          `SELECT * FROM broadcast_logs ORDER BY finished_at DESC LIMIT 1`
        );
        const row = (rows as any[])[0];
        if (!row) return null;
        return {
          message: row.message, total: row.total, sent: row.sent, failed: row.failed,
          sentClients: typeof row.sent_clients === 'string' ? JSON.parse(row.sent_clients) : (row.sent_clients || []),
          failedClients: typeof row.failed_clients === 'string' ? JSON.parse(row.failed_clients) : (row.failed_clients || []),
          errors: (typeof row.failed_clients === 'string' ? JSON.parse(row.failed_clients) : (row.failed_clients || [])).slice(0,10).map((c: any) => `${c.name}: ${c.error}`),
          startedAt: Number(row.started_at), finishedAt: Number(row.finished_at), done: true,
        };
      } finally {
        connection.release();
      }
    } else {
      const result = await pool.query(
        `SELECT * FROM broadcast_logs ORDER BY finished_at DESC LIMIT 1`
      );
      const row = result.rows?.[0];
      if (!row) return null;
      const sentClients = row.sent_clients || [];
      const failedClients = row.failed_clients || [];
      return {
        message: row.message, total: row.total, sent: row.sent, failed: row.failed,
        sentClients, failedClients,
        errors: failedClients.slice(0,10).map((c: any) => `${c.name}: ${c.error}`),
        startedAt: Number(row.started_at), finishedAt: Number(row.finished_at), done: true,
      };
    }
  } catch (error) {
    console.error("Failed to get last broadcast log:", error);
    return null;
  }
}

export async function ensureReminderSentColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'reminder_sent'`);
        if ((rows as any[]).length === 0) {
          await connection.query(`ALTER TABLE appointments ADD COLUMN reminder_sent BOOLEAN NOT NULL DEFAULT FALSE`);
          console.log("Added reminder_sent column to appointments");
        }
      } finally { connection.release(); }
    } else {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'reminder_sent') THEN
            ALTER TABLE appointments ADD COLUMN reminder_sent BOOLEAN NOT NULL DEFAULT FALSE;
          END IF;
        END $$;
      `);
    }
    console.log("Reminder sent column ready");
  } catch (error) {
    console.error("Failed to ensure reminder_sent column:", error);
  }
}

export async function ensureClientTagsColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'tags'`);
        if ((rows as any[]).length === 0) {
          await connection.query(`ALTER TABLE clients ADD COLUMN tags TEXT NULL`);
          console.log("Added tags column to clients");
        }
      } finally { connection.release(); }
    } else {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'tags') THEN
            ALTER TABLE clients ADD COLUMN tags TEXT NULL;
          END IF;
        END $$;
      `);
    }
    console.log("Client tags column ready");
  } catch (error) {
    console.error("Failed to ensure client tags column:", error);
  }
}

export async function ensurePaypalOrderIdColumn(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.query(`
          SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'paypal_order_id'
        `);
        if ((rows as any[]).length === 0) {
          await connection.query(`ALTER TABLE appointments ADD COLUMN paypal_order_id VARCHAR(100) NULL DEFAULT NULL`);
          console.log("Added paypal_order_id column to appointments");
        }
      } finally {
        connection.release();
      }
    } else {
      await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'paypal_order_id') THEN
            ALTER TABLE appointments ADD COLUMN paypal_order_id TEXT NULL;
          END IF;
        END $$;
      `);
    }
    console.log("PayPal order ID column ready");
  } catch (error) {
    console.error("Failed to ensure paypal_order_id column:", error);
  }
}

// ─── Website testimonials ────────────────────────────────────────────────────

export interface WebsiteTestimonial {
  id: number;
  clientName: string;
  clientPhotoUrl: string | null;
  serviceName: string | null;
  rating: number;
  text: string;
  isVisible: boolean;
  createdAt: string;
}

export async function ensureWebsiteTestimonialsTable(): Promise<void> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      try {
        await connection.query(`
          CREATE TABLE IF NOT EXISTS website_testimonials (
            id INT AUTO_INCREMENT PRIMARY KEY,
            client_name VARCHAR(100) NOT NULL,
            client_photo_url TEXT,
            service_name VARCHAR(255),
            rating INT NOT NULL DEFAULT 5,
            text TEXT NOT NULL,
            is_visible BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
      } finally { connection.release(); }
    } else {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS website_testimonials (
          id SERIAL PRIMARY KEY,
          client_name VARCHAR(100) NOT NULL,
          client_photo_url TEXT,
          service_name VARCHAR(255),
          rating INTEGER NOT NULL DEFAULT 5,
          text TEXT NOT NULL,
          is_visible BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
    }
    console.log("Website testimonials table ready");
  } catch (error) {
    console.error("Failed to ensure website_testimonials table:", error);
  }
}

function mapTestimonialRow(row: any): WebsiteTestimonial {
  return {
    id: row.id,
    clientName: row.client_name,
    clientPhotoUrl: row.client_photo_url ?? null,
    serviceName: row.service_name ?? null,
    rating: row.rating ?? 5,
    text: row.text,
    isVisible: row.is_visible !== false && row.is_visible !== 0,
    createdAt: row.created_at ? String(row.created_at) : new Date().toISOString(),
  };
}

export async function getWebsiteTestimonials(visibleOnly = false): Promise<WebsiteTestimonial[]> {
  try {
    if (dbDialect === 'mysql') {
      const connection = await pool.getConnection();
      try {
        const condition = visibleOnly ? ' WHERE is_visible = TRUE' : '';
        const [rows] = await connection.query(`SELECT * FROM website_testimonials${condition} ORDER BY created_at DESC`);
        return (rows as any[]).map(mapTestimonialRow);
      } finally { connection.release(); }
    } else {
      const condition = visibleOnly ? ' WHERE is_visible = TRUE' : '';
      const result = await pool.query(`SELECT * FROM website_testimonials${condition} ORDER BY created_at DESC`);
      return result.rows.map(mapTestimonialRow);
    }
  } catch { return []; }
}

export async function addWebsiteTestimonial(data: Omit<WebsiteTestimonial, 'id' | 'createdAt'>): Promise<WebsiteTestimonial> {
  if (dbDialect === 'mysql') {
    const connection = await pool.getConnection();
    try {
      const [result] = await connection.query(
        `INSERT INTO website_testimonials (client_name, client_photo_url, service_name, rating, text, is_visible) VALUES (?, ?, ?, ?, ?, ?)`,
        [data.clientName, data.clientPhotoUrl ?? null, data.serviceName ?? null, data.rating, data.text, data.isVisible ? 1 : 0]
      );
      const [rows] = await connection.query(`SELECT * FROM website_testimonials WHERE id = ?`, [(result as any).insertId]);
      return mapTestimonialRow((rows as any[])[0]);
    } finally { connection.release(); }
  } else {
    const result = await pool.query(
      `INSERT INTO website_testimonials (client_name, client_photo_url, service_name, rating, text, is_visible) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [data.clientName, data.clientPhotoUrl ?? null, data.serviceName ?? null, data.rating, data.text, data.isVisible]
    );
    return mapTestimonialRow(result.rows[0]);
  }
}

export async function updateWebsiteTestimonial(id: number, data: Partial<Omit<WebsiteTestimonial, 'id' | 'createdAt'>>): Promise<WebsiteTestimonial | null> {
  if (dbDialect === 'mysql') {
    const connection = await pool.getConnection();
    try {
      const sets: string[] = [];
      const vals: any[] = [];
      if (data.clientName !== undefined) { sets.push('client_name=?'); vals.push(data.clientName); }
      if (data.clientPhotoUrl !== undefined) { sets.push('client_photo_url=?'); vals.push(data.clientPhotoUrl); }
      if (data.serviceName !== undefined) { sets.push('service_name=?'); vals.push(data.serviceName); }
      if (data.rating !== undefined) { sets.push('rating=?'); vals.push(data.rating); }
      if (data.text !== undefined) { sets.push('text=?'); vals.push(data.text); }
      if (data.isVisible !== undefined) { sets.push('is_visible=?'); vals.push(data.isVisible ? 1 : 0); }
      if (!sets.length) return null;
      vals.push(id);
      await connection.query(`UPDATE website_testimonials SET ${sets.join(',')} WHERE id=?`, vals);
      const [rows] = await connection.query(`SELECT * FROM website_testimonials WHERE id=?`, [id]);
      return (rows as any[]).length ? mapTestimonialRow((rows as any[])[0]) : null;
    } finally { connection.release(); }
  } else {
    const sets: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (data.clientName !== undefined) { sets.push(`client_name=$${i++}`); vals.push(data.clientName); }
    if (data.clientPhotoUrl !== undefined) { sets.push(`client_photo_url=$${i++}`); vals.push(data.clientPhotoUrl); }
    if (data.serviceName !== undefined) { sets.push(`service_name=$${i++}`); vals.push(data.serviceName); }
    if (data.rating !== undefined) { sets.push(`rating=$${i++}`); vals.push(data.rating); }
    if (data.text !== undefined) { sets.push(`text=$${i++}`); vals.push(data.text); }
    if (data.isVisible !== undefined) { sets.push(`is_visible=$${i++}`); vals.push(data.isVisible); }
    if (!sets.length) return null;
    vals.push(id);
    const result = await pool.query(`UPDATE website_testimonials SET ${sets.join(',')} WHERE id=$${i} RETURNING *`, vals);
    return result.rows.length ? mapTestimonialRow(result.rows[0]) : null;
  }
}

export async function deleteWebsiteTestimonial(id: number): Promise<void> {
  if (dbDialect === 'mysql') {
    const connection = await pool.getConnection();
    try {
      await connection.query(`DELETE FROM website_testimonials WHERE id=?`, [id]);
    } finally { connection.release(); }
  } else {
    await pool.query(`DELETE FROM website_testimonials WHERE id=$1`, [id]);
  }
}
