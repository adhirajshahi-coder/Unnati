/**
 * Which Postgres URL to use, and for what.
 *
 * There are two of them on a Supabase deployment, and using the wrong one for the wrong
 * job fails in ways that are hard to read:
 *
 *   - The **transaction pooler** (port 6543) is what serving requests wants. It lets
 *     many short-lived serverless instances share a small number of real Postgres
 *     connections, which is the only way a lambda-per-request app stays inside a sixty
 *     connection limit.
 *   - The **direct connection** (port 5432) is what migrations want. The transaction
 *     pooler hands out a different backend per statement and drops session state
 *     between them, which is exactly the wrong substrate for DDL running inside a
 *     transaction. Migrations are rare, run once, and can afford a real connection.
 *
 * The names are a mess for a second reason: Supabase's Vercel integration injects its
 * own variables — POSTGRES_URL and POSTGRES_URL_NON_POOLING — rather than the
 * DATABASE_URL this app was written against. Rather than making someone notice that
 * and hand-copy a third variable, both spellings are accepted here, in one place.
 */

/** Serving requests: pooled where a pooler exists. */
export function runtimeDatabaseUrl(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    // Set by Supabase's Vercel integration; already the transaction pooler.
    process.env.POSTGRES_URL ||
    undefined
  );
}

/**
 * Migrations and seeding: a direct connection where one is known.
 *
 * Falls back to the runtime URL when nothing direct is configured, which is right for
 * Render — its Postgres has no separate pooler, so the one URL is the direct one.
 */
export function migrationDatabaseUrl(): string | undefined {
  return (
    process.env.DIRECT_DATABASE_URL ||
    // Set by Supabase's Vercel integration: the 5432 connection, not the pooler.
    process.env.POSTGRES_URL_NON_POOLING ||
    runtimeDatabaseUrl()
  );
}

/** Whether to present a TLS certificate chain we verify. */
export function databaseSsl() {
  return process.env.DATABASE_SSL === "disable"
    ? false
    : // Render signs with its own CA and Supabase requires TLS; neither needs the chain
      // verified from inside a trusted network.
      { rejectUnauthorized: false };
}
