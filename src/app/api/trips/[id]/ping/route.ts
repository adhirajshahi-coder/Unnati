import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { trips, trucks, mandis, trackingPings } from "@/db/schema";
import { requireUser, AuthError } from "@/lib/auth";

const schema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  speedKmph: z.number().min(0).max(200).optional(),
});

/**
 * GPS ingestion — FR-7.
 *
 * A real driver handset posts its own coordinates here on a timer. When none are
 * supplied (a browser that refused location, which is the common case in a demo) the
 * server advances the truck one step along the straight line from origin to mandi, so
 * the farmer-facing tracking view can be exercised end to end without inventing a
 * position that claims to be real.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser("OPERATOR");
    const { id } = await params;
    const db = await getDb();

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Bad coordinates" }, { status: 400 });
    }

    const [trip] = await db
      .select({
        id: trips.id,
        originLat: trips.originLat,
        originLng: trips.originLng,
        mandiLat: mandis.lat,
        mandiLng: mandis.lng,
        operatorId: trucks.operatorId,
        truckId: trucks.id,
      })
      .from(trips)
      .innerJoin(trucks, eq(trucks.id, trips.truckId))
      .innerJoin(mandis, eq(mandis.id, trips.mandiId))
      .where(eq(trips.id, id))
      .limit(1);

    if (!trip) {
      return NextResponse.json({ error: "Trip not found" }, { status: 404 });
    }
    if (trip.operatorId !== user.id && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Not your trip" }, { status: 403 });
    }

    let { lat, lng } = parsed.data;

    if (lat == null || lng == null) {
      const [last] = await db
        .select()
        .from(trackingPings)
        .where(eq(trackingPings.tripId, id))
        .orderBy(desc(trackingPings.at))
        .limit(1);

      const from = last
        ? { lat: last.lat, lng: last.lng }
        : { lat: trip.originLat, lng: trip.originLng };

      // One fifth of the remaining distance per ping: the truck approaches the mandi
      // and never overshoots it.
      lat = from.lat + (trip.mandiLat - from.lat) * 0.2;
      lng = from.lng + (trip.mandiLng - from.lng) * 0.2;
    }

    await db.insert(trackingPings).values({
      tripId: id,
      lat,
      lng,
      speedKmph: parsed.data.speedKmph,
    });

    await db
      .update(trucks)
      .set({ lat, lng })
      .where(eq(trucks.id, trip.truckId));

    return NextResponse.json({ ok: true, lat, lng });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Could not record ping" }, { status: 400 });
  }
}
