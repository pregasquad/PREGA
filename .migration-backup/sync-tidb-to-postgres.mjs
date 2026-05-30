import mysql from 'mysql2/promise';
import pg from 'pg';

async function main() {
  const mysqlUrl = process.env.MYSQL_URL;
  const pgUrl = process.env.DATABASE_URL;
  
  if (!mysqlUrl || !pgUrl) {
    console.error('MYSQL_URL or DATABASE_URL not set');
    process.exit(1);
  }
  
  // Connect to TiDB
  const urlObj = new URL(mysqlUrl);
  const tidb = await mysql.createConnection({
    host: urlObj.hostname,
    port: parseInt(urlObj.port) || 4000,
    user: urlObj.username,
    password: urlObj.password,
    database: urlObj.pathname.slice(1),
    ssl: { rejectUnauthorized: true }
  });
  
  // Connect to PostgreSQL
  const pgClient = new pg.Client(pgUrl);
  await pgClient.connect();
  
  try {
    // Sync clients
    console.log('Syncing clients...');
    const [clients] = await tidb.execute('SELECT * FROM clients');
    for (const c of clients) {
      await pgClient.query(`
        INSERT INTO clients (id, name, phone, email, birthday, notes, loyalty_points, total_visits, total_spent, referred_by, created_at, loyalty_enrolled, use_points)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET 
          name = EXCLUDED.name, phone = EXCLUDED.phone, email = EXCLUDED.email, birthday = EXCLUDED.birthday,
          notes = EXCLUDED.notes, loyalty_points = EXCLUDED.loyalty_points, total_visits = EXCLUDED.total_visits,
          total_spent = EXCLUDED.total_spent, referred_by = EXCLUDED.referred_by, loyalty_enrolled = EXCLUDED.loyalty_enrolled,
          use_points = EXCLUDED.use_points
      `, [c.id, c.name, c.phone, c.email, c.birthday, c.notes, c.loyalty_points, c.total_visits, c.total_spent, c.referred_by, c.created_at, c.loyalty_enrolled, c.use_points]);
    }
    console.log(`Synced ${clients.length} clients`);
    
    // Sync gift_cards
    console.log('Syncing gift cards...');
    const [giftCards] = await tidb.execute('SELECT * FROM gift_cards');
    for (const g of giftCards) {
      await pgClient.query(`
        INSERT INTO gift_cards (id, code, initial_balance, current_balance, purchased_by, recipient_name, recipient_phone, expires_at, is_active, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET 
          code = EXCLUDED.code, initial_balance = EXCLUDED.initial_balance, current_balance = EXCLUDED.current_balance,
          purchased_by = EXCLUDED.purchased_by, recipient_name = EXCLUDED.recipient_name, recipient_phone = EXCLUDED.recipient_phone,
          expires_at = EXCLUDED.expires_at, is_active = EXCLUDED.is_active
      `, [g.id, g.code, g.initial_balance, g.current_balance, g.purchased_by, g.recipient_name, g.recipient_phone, g.expires_at, g.is_active, g.created_at]);
    }
    console.log(`Synced ${giftCards.length} gift cards`);
    
    // Sync categories first (needed for services)
    console.log('Syncing categories...');
    const [categories] = await tidb.execute('SELECT * FROM categories');
    for (const c of categories) {
      await pgClient.query(`
        INSERT INTO categories (id, name, color)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color
      `, [c.id, c.name, c.color]);
    }
    console.log(`Synced ${categories.length} categories`);
    
    // Sync services (without color column for PG)
    console.log('Syncing services...');
    const [services] = await tidb.execute('SELECT * FROM services');
    for (const s of services) {
      await pgClient.query(`
        INSERT INTO services (id, name, duration, price, category, linked_product_id)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET 
          name = EXCLUDED.name, duration = EXCLUDED.duration, price = EXCLUDED.price,
          category = EXCLUDED.category, linked_product_id = EXCLUDED.linked_product_id
      `, [s.id, s.name, s.duration, s.price, s.category, s.linked_product_id]);
    }
    console.log(`Synced ${services.length} services`);
    
    // Sync staff
    console.log('Syncing staff...');
    const [staff] = await tidb.execute('SELECT * FROM staff');
    for (const s of staff) {
      await pgClient.query(`
        INSERT INTO staff (id, name, phone, color, commission, categories)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET 
          name = EXCLUDED.name, phone = EXCLUDED.phone, color = EXCLUDED.color,
          commission = EXCLUDED.commission, categories = EXCLUDED.categories
      `, [s.id, s.name, s.phone, s.color, s.commission, s.categories]);
    }
    console.log(`Synced ${staff.length} staff`);
    
    // Sync admin_roles
    console.log('Syncing admin roles...');
    const [adminRoles] = await tidb.execute('SELECT * FROM admin_roles');
    for (const a of adminRoles) {
      await pgClient.query(`
        INSERT INTO admin_roles (id, name, pin_hash, role, permissions, photo)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET 
          name = EXCLUDED.name, pin_hash = EXCLUDED.pin_hash, role = EXCLUDED.role,
          permissions = EXCLUDED.permissions, photo = EXCLUDED.photo
      `, [a.id, a.name, a.pin_hash, a.role, a.permissions, a.photo]);
    }
    console.log(`Synced ${adminRoles.length} admin roles`);
    
    // Sync appointments
    console.log('Syncing appointments...');
    const [appointments] = await tidb.execute('SELECT * FROM appointments');
    for (const a of appointments) {
      await pgClient.query(`
        INSERT INTO appointments (id, date, time, duration, client, client_id, service, staff, price, paid, notes, total, status, services_json, created_by, created_at, updated_at, updated_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (id) DO UPDATE SET 
          date = EXCLUDED.date, time = EXCLUDED.time, duration = EXCLUDED.duration, client = EXCLUDED.client,
          client_id = EXCLUDED.client_id, service = EXCLUDED.service, staff = EXCLUDED.staff, price = EXCLUDED.price,
          paid = EXCLUDED.paid, notes = EXCLUDED.notes, total = EXCLUDED.total, status = EXCLUDED.status,
          services_json = EXCLUDED.services_json, created_by = EXCLUDED.created_by, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
      `, [a.id, a.date, a.time, a.duration, a.client, a.client_id, a.service, a.staff, a.price, a.paid, a.notes, a.total, a.status, a.services_json, a.created_by, a.created_at, a.updated_at, a.updated_by]);
    }
    console.log(`Synced ${appointments.length} appointments`);
    
    // Sync loyalty_redemptions
    console.log('Syncing loyalty redemptions...');
    const [redemptions] = await tidb.execute('SELECT * FROM loyalty_redemptions');
    for (const r of redemptions) {
      await pgClient.query(`
        INSERT INTO loyalty_redemptions (id, client_id, points_used, reward_description, date, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO UPDATE SET 
          client_id = EXCLUDED.client_id, points_used = EXCLUDED.points_used, 
          reward_description = EXCLUDED.reward_description, date = EXCLUDED.date
      `, [r.id, r.client_id, r.points_used, r.reward_description, r.date, r.created_at]);
    }
    console.log(`Synced ${redemptions.length} loyalty redemptions`);
    
    // Update sequences
    console.log('Updating sequences...');
    await pgClient.query("SELECT setval('clients_id_seq', COALESCE((SELECT MAX(id) FROM clients), 1))");
    await pgClient.query("SELECT setval('gift_cards_id_seq', COALESCE((SELECT MAX(id) FROM gift_cards), 1))");
    await pgClient.query("SELECT setval('services_id_seq', COALESCE((SELECT MAX(id) FROM services), 1))");
    await pgClient.query("SELECT setval('staff_id_seq', COALESCE((SELECT MAX(id) FROM staff), 1))");
    await pgClient.query("SELECT setval('categories_id_seq', COALESCE((SELECT MAX(id) FROM categories), 1))");
    await pgClient.query("SELECT setval('admin_roles_id_seq', COALESCE((SELECT MAX(id) FROM admin_roles), 1))");
    await pgClient.query("SELECT setval('appointments_id_seq', COALESCE((SELECT MAX(id) FROM appointments), 1))");
    await pgClient.query("SELECT setval('loyalty_redemptions_id_seq', COALESCE((SELECT MAX(id) FROM loyalty_redemptions), 1))");
    
    console.log('\n✅ Sync complete!');
    
  } finally {
    await tidb.end();
    await pgClient.end();
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
