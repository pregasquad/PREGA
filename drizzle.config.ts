import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set.");
}

const dbDialect = process.env.DB_DIALECT || 'postgres';

export default defineConfig({
  out: "./migrations",
  schema: dbDialect === 'mysql' ? "./shared/schema/mysql.ts" : "./shared/schema/postgres.ts",
  dialect: dbDialect === 'mysql' ? "mysql" : "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
