import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  runtimeDatabaseUrl,
  migrationDatabaseUrl,
  databaseSsl,
} from "../src/db/url";

/**
 * Which database URL gets used for what.
 *
 * Worth testing because every failure here happens in a deployment rather than on a
 * laptop, and each one looks like something else: the app finding no database at all
 * (Supabase's Vercel integration sets POSTGRES_URL, not DATABASE_URL), or migrations
 * failing strangely because DDL went through a transaction pooler that keeps no
 * session state between statements.
 */

const KEYS = [
  "DATABASE_URL",
  "POSTGRES_URL",
  "POSTGRES_URL_NON_POOLING",
  "DIRECT_DATABASE_URL",
  "DATABASE_SSL",
] as const;

const POOLED = "postgresql://u:p@host.pooler.supabase.com:6543/postgres";
const DIRECT = "postgresql://u:p@db.host.supabase.co:5432/postgres";
const RENDER = "postgresql://u:p@dpg-abc123-a/unnati";

function clear() {
  for (const k of KEYS) delete process.env[k];
}

afterEach(clear);

test("nothing set means PGlite — both resolvers stay empty", () => {
  clear();
  assert.equal(runtimeDatabaseUrl(), undefined);
  assert.equal(migrationDatabaseUrl(), undefined);
});

test("DATABASE_URL alone drives both, which is the Render shape", () => {
  clear();
  process.env.DATABASE_URL = RENDER;
  assert.equal(runtimeDatabaseUrl(), RENDER);
  // Render's Postgres has no separate pooler, so the one URL is the direct one.
  assert.equal(migrationDatabaseUrl(), RENDER);
});

test("Supabase's Vercel integration is picked up without DATABASE_URL", () => {
  // The integration injects these names and never sets DATABASE_URL. Before this
  // resolver existed, a correctly configured project found no database at all.
  clear();
  process.env.POSTGRES_URL = POOLED;
  process.env.POSTGRES_URL_NON_POOLING = DIRECT;

  assert.equal(runtimeDatabaseUrl(), POOLED);
  assert.equal(migrationDatabaseUrl(), DIRECT);
});

test("serving uses the pooler and migrating uses the direct connection", () => {
  clear();
  process.env.POSTGRES_URL = POOLED;
  process.env.POSTGRES_URL_NON_POOLING = DIRECT;

  assert.match(runtimeDatabaseUrl()!, /:6543\//);
  assert.match(migrationDatabaseUrl()!, /:5432\//);
});

test("an explicit DIRECT_DATABASE_URL outranks the integration's", () => {
  clear();
  process.env.POSTGRES_URL = POOLED;
  process.env.POSTGRES_URL_NON_POOLING = DIRECT;
  process.env.DIRECT_DATABASE_URL = RENDER;

  assert.equal(migrationDatabaseUrl(), RENDER);
  assert.equal(runtimeDatabaseUrl(), POOLED, "runtime is unaffected");
});

test("DATABASE_URL outranks the integration's pooled URL", () => {
  // Someone who sets DATABASE_URL by hand means it.
  clear();
  process.env.DATABASE_URL = RENDER;
  process.env.POSTGRES_URL = POOLED;

  assert.equal(runtimeDatabaseUrl(), RENDER);
});

test("migrations fall back to the runtime URL when nothing direct is known", () => {
  clear();
  process.env.POSTGRES_URL = POOLED;
  assert.equal(migrationDatabaseUrl(), POOLED);
});

test("TLS is on by default and only an explicit disable turns it off", () => {
  clear();
  assert.deepEqual(databaseSsl(), { rejectUnauthorized: false });

  process.env.DATABASE_SSL = "require";
  assert.deepEqual(databaseSsl(), { rejectUnauthorized: false });

  process.env.DATABASE_SSL = "disable";
  assert.equal(databaseSsl(), false);
});
