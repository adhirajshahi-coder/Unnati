import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth";
import { leavePool, claimPool } from "@/lib/pools";

const claimSchema = z.object({ truckId: z.string().min(1) });

/**
 * Act on a group: a farmer leaves it, or an operator claims it.
 *
 * Claiming is the moment a gathering of intentions becomes a real booking — it
 * creates the trip, confirms every member's load, splits the cost and raises each
 * farmer's payable with its seven-day reminder.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const { id, action } = await params;

    if (action === "leave") {
      const user = await requireUser();
      await leavePool(id, user.id);
      return NextResponse.json({ ok: true });
    }

    if (action === "claim") {
      const operator = await requireUser("OPERATOR");
      const parsed = claimSchema.safeParse(await req.json());

      if (!parsed.success) {
        return NextResponse.json(
          { error: "Choose which truck will carry this group." },
          { status: 400 },
        );
      }

      const result = await claimPool(id, operator.id, parsed.data.truckId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 404 });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update the group." },
      { status: 400 },
    );
  }
}
