/**
 * Database connection.
 *
 * One Postgres schema, two drivers:
 *
 *   - `DATABASE_URL` set   → node-postgres against a real server (Render Managed Postgres).
 *   - `DATABASE_URL` unset → PGlite, real Postgres compiled to WASM, stored under `.data/pglite`.
 *
 * The second path is what makes this app testable on a machine with no Postgres and no
 * Docker. It is the same SQL dialect, so nothing about the queries changes between them.
 *
 * Both drivers are imported dynamically so the bundler never pulls the WASM build into a
 * production server that will not use it.
 */
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import * as schema from "./schema";

/**
 * One type covering both drivers. The query-result and relations parameters are the
 * only places node-postgres and PGlite differ, and neither is referenced by callers.
 */
export type Db = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

let cached: Promise<Db> | undefined;

/**
 * Absolute path to the generated SQL migrations folder.
 *
 * Resolved from the working directory rather than `import.meta.url`: bundlers treat
 * `new URL(..., import.meta.url)` as an asset reference and try to resolve the target
 * at build time, which fails for a directory of loose `.sql` files. Next runs from the
 * project root in both `next dev` and `next start`.
 */
function migrationsFolder() {
  return `${process.cwd()}/drizzle`;
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;

  if (url) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: url,
      // Render's managed Postgres presents a certificate signed by its own CA. Internal
      // connections inside a Render private network do not need verification; external
      // ones do. Opt in with DATABASE_SSL=require.
      ssl:
        process.env.DATABASE_SSL === "disable"
          ? false
          : { rejectUnauthorized: false },
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    });
    return drizzle(pool, { schema }) as unknown as Db;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");

  const dir = process.env.PGLITE_DIR ?? ".data/pglite";
  // PGlite's Node filesystem layer calls a non-recursive mkdir, so it fails if the
  // parent does not already exist. Create the whole path first.
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dir, { recursive: true });

  const client = new PGlite(dir);
  const db = drizzle(client, { schema }) as unknown as Db;

  // PGlite is a local file; there is no separate deploy step to run migrations in, so
  // bring the schema up to date on first connect.
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  await migrate(db as never, { migrationsFolder: migrationsFolder() });

  return db;
}

export function getDb(): Promise<Db> {
  // Next.js dev mode re-evaluates modules on every hot reload; keep the connection on
  // globalThis so we do not open a new pool (or a second PGlite handle) each time.
  const g = globalThis as typeof globalThis & { __unnatiDb?: Promise<Db> };
  if (!g.__unnatiDb) g.__unnatiDb = connect();
  cached = g.__unnatiDb;
  return cached;
}

export { schema };
