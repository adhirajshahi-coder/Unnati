/**
 * Apply pending migrations to a real Postgres server.
 *
 * Run from the Vercel build (`vercel-build`), where it happens exactly once, and by
 * hand against a new database. Locally it is unnecessary — the PGlite path in
 * `src/db/index.ts` migrates itself on first connect — so this refuses to run with no
 * URL configured rather than silently doing nothing.
 *
 * Deliberately asks for the *direct* connection rather than the pooled one. A
 * transaction pooler hands out a different backend per statement and keeps no session
 * state between them, which is the wrong ground for DDL inside a transaction.
 * Migrations run once and can afford a real connection; serving requests cannot.
 */
import { config } from "dotenv";

// As in the seed script: a plain script does not read .env.local the way Next does, and
// putting the URL in that file beats pasting a password onto a command line.
config({ path: ".env.local" });
config({ path: ".env" });

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { databaseSsl, migrationDatabaseUrl } from "../src/db/url";

const url = migrationDatabaseUrl();
if (!url) {
  console.error(
    "No database URL is set (DATABASE_URL, DIRECT_DATABASE_URL or POSTGRES_URL*).\n" +
      "Local development uses PGlite, which migrates itself on first connect.",
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: url, ssl: databaseSsl() });

const db = drizzle(pool);

migrate(db, { migrationsFolder: "drizzle" })
  .then(async () => {
    console.log("Migrations applied.");
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Migration failed:", err);
    await pool.end();
    process.exit(1);
  });
