import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth";
import { createTrip } from "@/lib/booking";

const schema = z.object({
  truckId: z.string().min(1),
  mandiId: z.string().min(1),
  originName: z.string().min(1),
  departAt: z.string().datetime(),
});

/** An operator opens a run and its space is offered to nearby farmers. */
export async function POST(req: Request) {
  try {
    const user = await requireUser("OPERATOR");
    const parsed = schema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const trip = await createTrip({
      truckId: parsed.data.truckId,
      operatorId: user.id,
      mandiId: parsed.data.mandiId,
      originName: parsed.data.originName,
      // The operator's registered location is the depot the run starts from.
      originLat: user.lat ?? 20.0806,
      originLng: user.lng ?? 74.1103,
      departAt: new Date(parsed.data.departAt),
    });

    return NextResponse.json({ tripId: trip.id });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not start trip." },
      { status: 400 },
    );
  }
}
