/**
 * Apply pending migrations to a real Postgres server.
 *
 * Render runs this as the pre-deploy command. Locally it is unnecessary — the PGlite
 * path in `src/db/index.ts` migrates itself on first connect — so this script refuses
 * to run without DATABASE_URL rather than silently doing nothing.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL is not set. Local development uses PGlite, which migrates itself.",
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString: url,
  ssl:
    process.env.DATABASE_SSL === "disable"
      ? false
      : { rejectUnauthorized: false },
});

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
