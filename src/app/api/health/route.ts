import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { runtimeDatabaseUrl } from "@/db/url";

export const dynamic = "force-dynamic";

/**
 * Health check.
 *
 * It queries the database rather than returning a constant — a process that is
 * listening but cannot reach Postgres is not healthy, and a check that cannot tell the
 * difference is worse than no check at all.
 *
 * It also reports whether the schema is actually there, which matters because of how
 * deployment works now: migrations are run deliberately against a deployment's URL
 * rather than during its build. Get that far and forget, and every page fails with
 * `relation "users" does not exist` — accurate, and no use to anyone reading it for the
 * first time in a production log. This is the one endpoint that will be checked first,
 * so it is the right place to say plainly what is missing and which command fixes it.
 */
export async function GET() {
  const driver = runtimeDatabaseUrl() ? "postgres" : "pglite";

  try {
    const db = await getDb();
    await db.execute(sql`select 1`);

    // `to_regclass` answers "does this table exist" without throwing when it does not,
    // so a fresh database reports its state rather than failing the whole check.
    const migrated = await db.execute(
      sql`select to_regclass('public.users') is not null as ok`,
    );
    const rows = migrated as unknown as { rows?: Array<{ ok?: boolean }> };
    const schemaReady = Boolean(rows.rows?.[0]?.ok);

    if (!schemaReady) {
      return NextResponse.json(
        {
          ok: false,
          database: driver,
          schema: "missing",
          error:
            "Connected to the database, but its schema has not been created. " +
            "Run migrations against this deployment's database URL:\n" +
            '  DATABASE_URL="<url>" npm run db:migrate\n' +
            "Then seed it once if this is a new database: npm run db:seed",
          time: new Date().toISOString(),
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      database: driver,
      schema: "ready",
      time: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        database: driver,
        error: err instanceof Error ? err.message : "database unreachable",
      },
      { status: 503 },
    );
  }
}
