import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth";
import { joinOrStartPool } from "@/lib/pools";

const schema = z.object({
  mandiId: z.string().min(1),
  cropId: z.string().min(1),
  quantityKg: z.number().int().positive().max(40_000),
  grade: z.enum(["A", "B", "C"]),
  pickupName: z.string().min(1),
  pickupLat: z.number().min(6).max(38),
  pickupLng: z.number().min(68).max(98),
  listingId: z.string().optional(),
  departAt: z.string().datetime(),
  /** Join a specific group; omitted means "find me one or start one". */
  poolId: z.string().optional(),
});

/**
 * Start or join a farmer-led pooling group.
 *
 * One endpoint for both, because from the farmer's side it is one decision — "share
 * a truck to this mandi" — and which of the two happens depends on whether a suitable
 * group already exists, which is the app's problem, not theirs.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { departAt, ...rest } = parsed.data;
    const result = await joinOrStartPool({
      ...rest,
      farmerId: user.id,
      departAt: new Date(departAt),
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not join a group." },
      { status: 400 },
    );
  }
}
