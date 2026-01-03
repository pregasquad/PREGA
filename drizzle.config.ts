import { defineConfig } from "drizzle-kit";

if (!process.env.TIDB_DATABASE_URL) {
  throw new Error("TIDB_DATABASE_URL must be set");
}

const url = new URL(process.env.TIDB_DATABASE_URL);
url.searchParams.set("ssl", JSON.stringify({ rejectUnauthorized: true }));

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "mysql",
  dbCredentials: {
    url: url.toString(),
  },
});
