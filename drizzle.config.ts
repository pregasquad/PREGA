import { defineConfig } from "drizzle-kit";

const host = process.env.TIDB_HOST;
const port = parseInt(process.env.TIDB_PORT || "4000");
const user = process.env.TIDB_USER;
const password = process.env.TIDB_PASSWORD;
const database = process.env.TIDB_DATABASE;

if (!host || !user || !password || !database) {
  throw new Error("TiDB credentials must be set");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "mysql",
  strict: false,
  dbCredentials: {
    host,
    port,
    user,
    password,
    database,
    ssl: {
      rejectUnauthorized: true,
    },
  },
});
