import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.TIDB_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("TIDB_DATABASE_URL must be set.");
}

const urlWithSSL = databaseUrl.includes('?') 
  ? `${databaseUrl}&ssl={"rejectUnauthorized":true}` 
  : `${databaseUrl}?ssl={"rejectUnauthorized":true}`;

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "mysql",
  dbCredentials: {
    url: urlWithSSL,
  },
});
