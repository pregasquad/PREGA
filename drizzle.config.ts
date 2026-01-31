import { defineConfig } from "drizzle-kit";

const dbDialect = process.env.DB_DIALECT || 'postgres';
let databaseUrl = dbDialect === 'mysql' ? process.env.MYSQL_URL : process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(dbDialect === 'mysql' ? "MYSQL_URL must be set." : "DATABASE_URL must be set.");
}

// Add SSL for TiDB Cloud (requires secure connections)
if (dbDialect === 'mysql' && databaseUrl && !databaseUrl.includes('ssl=')) {
  const separator = databaseUrl.includes('?') ? '&' : '?';
  databaseUrl = `${databaseUrl}${separator}ssl={"rejectUnauthorized":true}`;
}

export default defineConfig({
  out: "./migrations",
  schema: dbDialect === 'mysql' ? "./shared/schema/mysql.ts" : "./shared/schema/postgres.ts",
  dialect: dbDialect === 'mysql' ? "mysql" : "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
