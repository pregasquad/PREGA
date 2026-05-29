
import mysql from 'mysql2/promise';

async function checkData() {
  const url = process.env.MYSQL_URL;
  if (!url) {
    console.error("MYSQL_URL not set");
    return;
  }

  try {
    const connection = await mysql.createConnection(url);
    const tables = ['admin_roles', 'staff', 'appointments', 'clients', 'services', 'products'];
    
    console.log("Checking TiDB tables...");
    for (const table of tables) {
      try {
        const [rows] = await connection.execute(`SELECT COUNT(*) as count FROM \`${table}\``);
        console.log(`Table ${table}: ${(rows as any)[0].count} rows`);
      } catch (e: any) {
        console.log(`Table ${table}: Error - ${e.message}`);
      }
    }
    
    const [adminRoles] = await connection.execute('SELECT * FROM admin_roles LIMIT 1');
    console.log("Admin Roles sample:", JSON.stringify(adminRoles, null, 2));
    
    await connection.end();
  } catch (error: any) {
    console.error("Connection error:", error.message);
  }
}

checkData();
