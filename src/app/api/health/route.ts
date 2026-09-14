import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Health check for Render.
 *
 * It actually queries the database rather than returning a constant — a process that
 * is listening but cannot reach Postgres is not healthy, and a check that cannot tell
 * the difference is worse than no check at all.
 */
export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);

    return NextResponse.json({
      ok: true,
      database: process.env.DATABASE_URL ? "postgres" : "pglite",
      time: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "database unreachable",
      },
      { status: 503 },
    );
  }
}
