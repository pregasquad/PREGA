import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "mysql",
  dbCredentials: {
    host: "gateway01.eu-central-1.prod.aws.tidbcloud.com",
    port: 4000,
    user: "Y2ErVcqWMZncviT.root",
    password: process.env.TIDB_PASSWORD || "jMAV2wFmvPoFKOe7",
    database: "test",
    ssl: {},
  },
});
