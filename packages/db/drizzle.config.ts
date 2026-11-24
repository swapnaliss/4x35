import { defineConfig } from "drizzle-kit";

// Paths are relative to the repo root: run drizzle-kit through the root scripts
// (`npm run db:generate`), never from inside packages/db.
export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/db/src/schema/",
  out: "./drizzle",
  dbCredentials: {
    // Read at run time from the environment; never written to a file.
    url: process.env.DATABASE_URL ?? "",
  },
  migrations: {
    table: "__drizzle_migrations",
    schema: "drizzle",
  },
});
