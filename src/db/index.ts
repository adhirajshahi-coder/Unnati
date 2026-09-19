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

/**
 * Turn a DNS failure against a Render database into the sentence that fixes it.
 *
 * `fromDatabase` in the blueprint supplies the database's internal hostname, and Render
 * resolves those only from inside the same region. Get the regions out of step and the
 * deploy dies with `getaddrinfo ENOTFOUND dpg-xxxxxxxxxxxx-a` — accurate, and no help
 * at all: nothing in it suggests looking at a region, so the natural reading is that
 * the database was never created.
 *
 * Anything that is not that failure is rethrown untouched.
 */
function explainConnectionFailure(err: unknown): unknown {
  const cause = (err as { cause?: { code?: string; hostname?: string } })?.cause;
  const code = cause?.code ?? (err as { code?: string })?.code;
  const host = cause?.hostname ?? (err as { hostname?: string })?.hostname;

  // Render's internal hostnames look like `dpg-<id>-a`, with no dots in them.
  const internalRenderHost =
    typeof host === "string" && host.startsWith("dpg-") && !host.includes(".");

  if (code !== "ENOTFOUND" || !internalRenderHost) return err;

  return new Error(
    `Cannot resolve the database host "${host}".\n\n` +
      "That is a Render internal hostname, which only resolves from a service in the " +
      "same region as the database. The usual cause is a render.yaml that sets a " +
      "region on the web service but not on the database, so Render puts them in " +
      "different regions.\n\n" +
      "Fix: give the `databases:` entry the same `region:` as the service, then delete " +
      "the database Render already created in the wrong region and re-apply the " +
      "blueprint — changing the region of an existing database is not possible.",
    { cause: err },
  );
}

/**
 * Is this a serverless runtime — many short-lived instances rather than one server?
 *
 * Two defaults below depend on the answer, and both are the difference between working
 * and failing rather than a tuning preference. Vercel sets VERCEL on every deployment.
 */
function isServerless() {
  return Boolean(process.env.VERCEL);
}

async function connect(): Promise<Db> {
  const url = process.env.DATABASE_URL;

  if (url) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: url,
      // Render's managed Postgres presents a certificate signed by its own CA, and
      // Supabase requires TLS outright. Neither needs us to verify the chain from
      // inside a trusted network. DATABASE_SSL=disable turns it off for local Postgres.
      ssl:
        process.env.DATABASE_SSL === "disable"
          ? false
          : { rejectUnauthorized: false },

      /*
       * One connection per instance on serverless, five on a long-lived server.
       *
       * A pool is an optimisation when one process handles every request and a liability
       * when fifty frozen lambdas are each holding five sockets open. Postgres counts
       * connections, not callers: Supabase's free tier allows sixty direct ones, and a
       * modest traffic spike would exhaust them and start refusing everyone — including
       * the instance trying to serve a farmer a price.
       *
       * Pair this with Supabase's transaction pooler (port 6543) rather than the direct
       * connection (5432), which is what makes many short-lived clients affordable.
       */
      max: Number(process.env.DATABASE_POOL_MAX ?? (isServerless() ? 1 : 5)),
    });
    const db = drizzle(pool, { schema }) as unknown as Db;

    /*
     * Bring the schema up to date here, the same way the PGlite path does.
     *
     * Render's free tier does not support a pre-deploy command, which is where
     * migrations belong and where this blueprint used to run them. The remaining honest
     * options were to migrate during the build — which happens in a different network
     * context that cannot always reach the database — or to migrate on first connect.
     * This is the second.
     *
     * It is safe there because a free service runs exactly one instance, so there is no
     * second process racing to apply the same file, and drizzle records what it has
     * applied either way.
     *
     * It is NOT safe on serverless, which is why this defaults off when VERCEL is set.
     * A cold burst starts many instances at once, each one would find the same migration
     * pending and run it, and they would collide inside a DDL statement — the kind of
     * failure that leaves a half-applied schema at the exact moment traffic arrives.
     * There, migrations belong in the build, which happens once: see the `vercel-build`
     * script in package.json.
     *
     * DB_AUTO_MIGRATE forces it either way if a deployment needs the opposite.
     */
    const autoMigrate =
      process.env.DB_AUTO_MIGRATE ?? (isServerless() ? "false" : "true");

    if (autoMigrate !== "false") {
      const { migrate } = await import("drizzle-orm/node-postgres/migrator");
      try {
        await migrate(db as never, { migrationsFolder: migrationsFolder() });
      } catch (err) {
        throw explainConnectionFailure(err);
      }
    }

    return db;
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
