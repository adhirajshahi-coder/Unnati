import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth";
import { requestJoin } from "@/lib/booking";

const schema = z.object({
  tripId: z.string().min(1),
  listingId: z.string().optional(),
  cropId: z.string().min(1),
  quantityKg: z.number().int().positive().max(40_000),
  grade: z.enum(["A", "B", "C"]),
  pickupName: z.string().min(1),
  pickupLat: z.number().min(-90).max(90),
  pickupLng: z.number().min(-180).max(180),
});

/** FR-4 — a farmer asks to put a load on an existing trip. */
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

    const load = await requestJoin({ ...parsed.data, farmerId: user.id });
    return NextResponse.json({ loadId: load.id });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not join." },
      { status: 400 },
    );
  }
}
