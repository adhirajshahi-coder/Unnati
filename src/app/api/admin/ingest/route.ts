import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth";
import { runIngest } from "@/lib/ingest";
import { hasApiKey } from "@/lib/pricefeed";

export const dynamic = "force-dynamic";
// One request per tracked market, so allow well past the default serverless budget.
export const maxDuration = 120;

/**
 * Pull live prices on demand.
 *
 * Admin-only: it is an outbound call per tracked market against a rate-limited
 * government API, and letting any signed-in user trigger it would exhaust the key.
 * In production this also runs on a schedule (see the README) — the button exists so
 * an operator can refresh before a demo without waiting for the next cron tick.
 */
export async function POST() {
  try {
    await requireUser("ADMIN");

    if (!hasApiKey()) {
      return NextResponse.json(
        {
          error:
            "DATA_GOV_API_KEY is not set, so there is no live feed to pull. Register a free key at data.gov.in and add it to the environment.",
        },
        { status: 400 },
      );
    }

    const summary = await runIngest();
    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "The price ingest failed.",
      },
      { status: 500 },
    );
  }
}
