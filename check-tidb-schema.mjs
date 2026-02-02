import mysql from 'mysql2/promise';

async function main() {
  const url = process.env.MYSQL_URL;
  if (!url) {
    console.error('MYSQL_URL not set');
    process.exit(1);
  }
  
  const urlObj = new URL(url);
  const connection = await mysql.createConnection({
    host: urlObj.hostname,
    port: parseInt(urlObj.port) || 4000,
    user: urlObj.username,
    password: urlObj.password,
    database: urlObj.pathname.slice(1),
    ssl: { rejectUnauthorized: true }
  });
  
  try {
    // Check all tables
    const [tables] = await connection.execute("SHOW TABLES");
    console.log("=== TABLES IN TIDB ===");
    tables.forEach(t => console.log(Object.values(t)[0]));
    
    // Check clients table structure
    console.log("\n=== CLIENTS TABLE STRUCTURE ===");
    const [clientCols] = await connection.execute("DESCRIBE clients");
    clientCols.forEach(c => console.log(`${c.Field}: ${c.Type} ${c.Null === 'NO' ? 'NOT NULL' : ''} ${c.Default ? 'DEFAULT ' + c.Default : ''}`));
    
    // Check gift_cards table
    console.log("\n=== GIFT_CARDS TABLE ===");
    try {
      const [giftCols] = await connection.execute("DESCRIBE gift_cards");
      giftCols.forEach(c => console.log(`${c.Field}: ${c.Type}`));
    } catch (e) {
      console.log("gift_cards table does not exist!");
    }
    
    // Check loyalty_redemptions table
    console.log("\n=== LOYALTY_REDEMPTIONS TABLE ===");
    try {
      const [loyaltyCols] = await connection.execute("DESCRIBE loyalty_redemptions");
      loyaltyCols.forEach(c => console.log(`${c.Field}: ${c.Type}`));
    } catch (e) {
      console.log("loyalty_redemptions table does not exist!");
    }
    
    // Check clients data
    console.log("\n=== CLIENTS COUNT ===");
    const [clientCount] = await connection.execute("SELECT COUNT(*) as count FROM clients");
    console.log("Total clients:", clientCount[0].count);
    
  } finally {
    await connection.end();
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
