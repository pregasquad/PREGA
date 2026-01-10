import mysql from 'mysql2/promise';
import pg from 'pg';

const MYSQL_URL = process.env.MYSQL_URL;
const SUPABASE_URL = process.env.SUPABASE_DATABASE_URL;

if (!MYSQL_URL) {
  throw new Error('MYSQL_URL environment variable is required');
}

if (!SUPABASE_URL) {
  throw new Error('SUPABASE_DATABASE_URL environment variable is required');
}

const TABLES_TO_MIGRATE = [
  'categories',
  'expense_categories', 
  'staff',
  'clients',
  'products',
  'services',
  'appointments',
  'charges',
  'staff_deductions',
  'loyalty_redemptions',
  'push_subscriptions',
  'admin_roles',
  'business_settings',
];

async function createPostgresTables(pgClient: pg.Client) {
  console.log('Creating PostgreSQL tables...');
  
  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      sid VARCHAR(255) PRIMARY KEY,
      sess JSON NOT NULL,
      expire TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions(expire);
  `);

  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(36) PRIMARY KEY,
      email VARCHAR(255) UNIQUE,
      first_name VARCHAR(255),
      last_name VARCHAR(255),
      profile_image_url VARCHAR(500),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE
    );
  `);

  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      color VARCHAR(50) NOT NULL DEFAULT '#6b7280'
    );
  `);

  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS staff (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      base_salary DOUBLE PRECISION NOT NULL DEFAULT 0
    );
  `);

  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      birthday TEXT,
      notes TEXT,
      loyalty_points INTEGER NOT NULL DEFAULT 0,
      total_visits INTEGER NOT NULL DEFAULT 0,
      total_spent DOUBLE PRECISION NOT NULL DEFAULT 0,
      referred_by INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      quantity INTEGER NOT NULL DEFAULT 0,
      low_stock_threshold INTEGER NOT NULL DEFAULT 5,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      price DOUBLE PRECISION NOT NULL,
      duration INTEGER NOT NULL,
      category TEXT NOT NULL,
      linked_product_id INTEGER,
      commission_percent DOUBLE PRECISION NOT NULL DEFAULT 50,
      loyalty_points_multiplier INTEGER NOT NULL DEFAULT 1
    );
  `);

  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      duration INTEGER NOT NULL,
      client TEXT NOT NULL,
      client_id INTEGER,
      service TEXT NOT NULL,
      staff TEXT NOT NULL,
      price DOUBLE PRECISION NOT NULL,
      total DOUBLE PRECISION NOT NULL,
      paid BOOLEAN NOT NULL DEFAULT FALSE,
      loyalty_points_earned INTEGER DEFAULT 0,
      created_by TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS charges (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      date TEXT NOT NULL,
      category_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS staff_deductions (
      id SERIAL PRIMARY KEY,
      staff_name TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      amount DOUBLE PRECISION NOT NULL,
      date TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS loyalty_redemptions (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL,
      points_used INTEGER NOT NULL,
      reward_description TEXT NOT NULL,
      date TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS admin_roles (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      role VARCHAR(50) NOT NULL DEFAULT 'receptionist',
      pin VARCHAR(255),
      permissions JSON NOT NULL DEFAULT '[]',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pgClient.query(`
    CREATE TABLE IF NOT EXISTS business_settings (
      id SERIAL PRIMARY KEY,
      business_name VARCHAR(255) NOT NULL DEFAULT 'PREGA SQUAD',
      logo TEXT,
      address TEXT,
      phone VARCHAR(50),
      email VARCHAR(255),
      currency VARCHAR(10) NOT NULL DEFAULT 'MAD',
      currency_symbol VARCHAR(10) NOT NULL DEFAULT 'DH',
      opening_time VARCHAR(10) NOT NULL DEFAULT '09:00',
      closing_time VARCHAR(10) NOT NULL DEFAULT '19:00',
      working_days JSON NOT NULL DEFAULT '[1,2,3,4,5,6]',
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  console.log('PostgreSQL tables created successfully');
}

async function migrateTable(
  mysqlConn: mysql.Connection,
  pgClient: pg.Client,
  tableName: string,
  columnMappings: Record<string, string>
) {
  console.log(`\nMigrating table: ${tableName}`);
  
  const [rows] = await mysqlConn.query(`SELECT * FROM ${tableName}`);
  const data = rows as any[];
  
  if (data.length === 0) {
    console.log(`  No data in ${tableName}, skipping...`);
    return 0;
  }
  
  console.log(`  Found ${data.length} rows to migrate`);
  
  let migratedCount = 0;
  
  for (const row of data) {
    const pgColumns: string[] = [];
    const pgValues: any[] = [];
    let paramIndex = 1;
    
    for (const [mysqlCol, pgCol] of Object.entries(columnMappings)) {
      if (row[mysqlCol] !== undefined) {
        pgColumns.push(pgCol);
        let value = row[mysqlCol];
        
        if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
          value = JSON.stringify(value);
        }
        
        pgValues.push(value);
      }
    }
    
    if (pgColumns.length > 0) {
      const placeholders = pgValues.map((_, i) => `$${i + 1}`).join(', ');
      const query = `INSERT INTO ${tableName} (${pgColumns.join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
      
      try {
        await pgClient.query(query, pgValues);
        migratedCount++;
      } catch (error: any) {
        console.error(`  Error inserting row:`, error.message);
      }
    }
  }
  
  console.log(`  Migrated ${migratedCount}/${data.length} rows`);
  return migratedCount;
}

async function resetSequences(pgClient: pg.Client) {
  console.log('\nResetting PostgreSQL sequences...');
  
  const tablesWithSerial = [
    'categories', 'expense_categories', 'staff', 'clients', 'products',
    'services', 'appointments', 'charges', 'staff_deductions',
    'loyalty_redemptions', 'push_subscriptions', 'admin_roles', 'business_settings'
  ];
  
  for (const table of tablesWithSerial) {
    try {
      await pgClient.query(`
        SELECT setval(pg_get_serial_sequence('${table}', 'id'), 
          COALESCE((SELECT MAX(id) FROM ${table}), 0) + 1, false)
      `);
      console.log(`  Reset sequence for ${table}`);
    } catch (error: any) {
      console.log(`  Could not reset sequence for ${table}: ${error.message}`);
    }
  }
}

async function main() {
  console.log('Starting TiDB to Supabase Migration\n');
  console.log('='.repeat(50));
  
  const mysqlUrl = new URL(MYSQL_URL!);
  const mysqlConn = await mysql.createConnection({
    host: mysqlUrl.hostname,
    port: parseInt(mysqlUrl.port) || 4000,
    user: decodeURIComponent(mysqlUrl.username),
    password: decodeURIComponent(mysqlUrl.password),
    database: mysqlUrl.pathname.slice(1),
    ssl: {
      rejectUnauthorized: true
    }
  });
  console.log('Connected to TiDB (MySQL)');
  
  const pgUrl = new URL(SUPABASE_URL!);
  const pgClient = new pg.Client({
    host: pgUrl.hostname,
    port: parseInt(pgUrl.port) || 5432,
    user: decodeURIComponent(pgUrl.username),
    password: decodeURIComponent(pgUrl.password),
    database: pgUrl.pathname.slice(1),
    ssl: { rejectUnauthorized: false }
  });
  await pgClient.connect();
  console.log('Connected to Supabase (PostgreSQL)');
  
  try {
    await createPostgresTables(pgClient);
    
    const columnMappings: Record<string, Record<string, string>> = {
      categories: { id: 'id', name: 'name' },
      expense_categories: { id: 'id', name: 'name', color: 'color' },
      staff: { id: 'id', name: 'name', color: 'color', phone: 'phone', email: 'email', base_salary: 'base_salary' },
      clients: {
        id: 'id', name: 'name', phone: 'phone', email: 'email', birthday: 'birthday',
        notes: 'notes', loyalty_points: 'loyalty_points', total_visits: 'total_visits',
        total_spent: 'total_spent', referred_by: 'referred_by', created_at: 'created_at'
      },
      products: { id: 'id', name: 'name', quantity: 'quantity', low_stock_threshold: 'low_stock_threshold', created_at: 'created_at' },
      services: {
        id: 'id', name: 'name', price: 'price', duration: 'duration', category: 'category',
        linked_product_id: 'linked_product_id', commission_percent: 'commission_percent',
        loyalty_points_multiplier: 'loyalty_points_multiplier'
      },
      appointments: {
        id: 'id', date: 'date', start_time: 'start_time', duration: 'duration',
        client: 'client', client_id: 'client_id', service: 'service', staff: 'staff',
        price: 'price', total: 'total', paid: 'paid', loyalty_points_earned: 'loyalty_points_earned',
        created_by: 'created_by', created_at: 'created_at'
      },
      charges: { id: 'id', type: 'type', name: 'name', amount: 'amount', date: 'date', category_id: 'category_id', created_at: 'created_at' },
      staff_deductions: {
        id: 'id', staff_name: 'staff_name', type: 'type', description: 'description',
        amount: 'amount', date: 'date', created_at: 'created_at'
      },
      loyalty_redemptions: {
        id: 'id', client_id: 'client_id', points_used: 'points_used',
        reward_description: 'reward_description', date: 'date', created_at: 'created_at'
      },
      push_subscriptions: { id: 'id', endpoint: 'endpoint', p256dh: 'p256dh', auth: 'auth', created_at: 'created_at' },
      admin_roles: { id: 'id', name: 'name', role: 'role', pin: 'pin', permissions: 'permissions', created_at: 'created_at' },
      business_settings: {
        id: 'id', business_name: 'business_name', logo: 'logo', address: 'address',
        phone: 'phone', email: 'email', currency: 'currency', currency_symbol: 'currency_symbol',
        opening_time: 'opening_time', closing_time: 'closing_time', working_days: 'working_days',
        updated_at: 'updated_at'
      }
    };
    
    let totalMigrated = 0;
    
    for (const table of TABLES_TO_MIGRATE) {
      const mapping = columnMappings[table];
      if (mapping) {
        const count = await migrateTable(mysqlConn, pgClient, table, mapping);
        totalMigrated += count;
      }
    }
    
    await resetSequences(pgClient);
    
    console.log('\n' + '='.repeat(50));
    console.log(`Migration completed! Total rows migrated: ${totalMigrated}`);
    
  } finally {
    await mysqlConn.end();
    await pgClient.end();
    console.log('\nConnections closed.');
  }
}

main().catch(console.error);
