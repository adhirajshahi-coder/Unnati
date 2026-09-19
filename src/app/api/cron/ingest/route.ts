import { NextResponse } from "next/server";
import { runIngest } from "@/lib/ingest";
import { hasApiKey } from "@/lib/pricefeed";

export const dynamic = "force-dynamic";
// One outbound request per tracked market, so well past the default budget.
export const maxDuration = 300;

/**
 * The scheduled price pull.
 *
 * Render ran this as a cron *service* with its own process. Vercel has no such thing —
 * a scheduled job there is an HTTP request the platform makes to your own app — so the
 * same ingest needs a door, and a door needs a lock.
 *
 * The lock is CRON_SECRET. Vercel sends it as `Authorization: Bearer <secret>` on every
 * scheduled invocation, and without the check this route would be an unauthenticated
 * endpoint that anyone on the internet could hold down to burn through a rate-limited
 * government API key. The sibling route at /api/admin/ingest is the same work behind a
 * session check, for an operator refreshing before a demo.
 *
 * With no CRON_SECRET configured the route refuses rather than running openly. A
 * scheduled job that quietly stopped is a problem you find in the logs; an open one is
 * a problem you find when the key is exhausted.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set, so scheduled ingest is disabled." },
      { status: 503 },
    );
  }

  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  if (!hasApiKey()) {
    return NextResponse.json(
      {
        error:
          "DATA_GOV_API_KEY is not set, so there is no live feed to pull. The app is serving its shipped baseline prices.",
      },
      { status: 400 },
    );
  }

  try {
    // Returned as-is. The summary carries its own `ok`, and it means something more
    // useful than "the handler ran": whether the feed actually delivered usable rows.
    const summary = await runIngest();
    return NextResponse.json(summary);
  } catch (err) {
    // Returned rather than thrown so the failure is readable in the platform's log of
    // scheduled runs, which is the only place anyone will look for it.
    console.error("[cron] price ingest failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
