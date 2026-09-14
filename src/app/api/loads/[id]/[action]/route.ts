import { NextResponse } from "next/server";
import { requireUser, AuthError } from "@/lib/auth";
import { acceptLoad, rejectLoad } from "@/lib/booking";

/**
 * Operator decides on a pending load.
 *
 * Accepting is where capacity is committed, every farmer's share is recalculated, and
 * the payable plus its seven-day reminder are written — all inside `acceptLoad`, so
 * this handler stays a thin authorisation wrapper.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const user = await requireUser("OPERATOR");
    const { id, action } = await params;

    if (action === "accept") {
      await acceptLoad(id, user.id);
    } else if (action === "reject") {
      await rejectLoad(id, user.id);
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update." },
      { status: 400 },
    );
  }
}
