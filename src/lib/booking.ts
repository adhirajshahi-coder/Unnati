/**
 * Booking service — the orchestration layer between the HTTP routes and the engine.
 *
 * Routes here do no arithmetic and the engine does no I/O; this module is the only
 * place the two meet. Anything involving money recalculates from the engine rather
 * than trusting a stored figure, so a stale `costShare` can never be charged.
 */
import { and, eq, desc, inArray, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  crops,
  mandis,
  priceRecords,
  trips,
  trucks,
  loads,
  listings,
  users,
} from "@/db/schema";
import { roadDistanceKm, detourKm } from "@/lib/engine/geo";
import { tripCost, splitCost, soloCost, savings } from "@/lib/engine/costs";
import { rankMandis, type MandiCandidate } from "@/lib/engine/netPrice";
import { pooledQuote, scoreLoads, bestFill } from "@/lib/engine/pooling";
import { preferPrice } from "@/lib/engine/sources";
import { chargeWithReminder, notify, notifyTripWatchers } from "@/lib/notifications";

/** Default whole-vehicle rate when no specific truck has been chosen yet. */
export const DEFAULT_RATE_PER_KM = 38;
/** Farmers pay their transport share this many days after delivery. */
export const PAYMENT_TERM_DAYS = 14;

/* ------------------------------------------------------- price discovery */

/** Latest price per mandi for one crop. One row per mandi, newest first. */
export async function latestPrices(cropId: string): Promise<MandiCandidate[]> {
  const db = await getDb();

  // Ordered newest-first, then reduced per mandi by preferPrice — which weighs the
  // source as well as the timestamp, so a real government price is never shadowed by
  // the shipped baseline written minutes later.
  const rows = await db
    .select({
      id: mandis.id,
      name: mandis.name,
      nameHi: mandis.nameHi,
      district: mandis.district,
      state: mandis.state,
      lat: mandis.lat,
      lng: mandis.lng,
      commissionRate: mandis.commissionRate,
      marketFeePerQuintal: mandis.marketFeePerQuintal,
      modalPrice: priceRecords.modalPrice,
      minPrice: priceRecords.minPrice,
      maxPrice: priceRecords.maxPrice,
      source: priceRecords.source,
      recordedAt: priceRecords.recordedAt,
    })
    .from(priceRecords)
    .innerJoin(mandis, eq(mandis.id, priceRecords.mandiId))
    .where(eq(priceRecords.cropId, cropId))
    .orderBy(priceRecords.mandiId, desc(priceRecords.recordedAt));

  const bestPerMandi = new Map<string, MandiCandidate>();
  for (const r of rows) {
    const candidate = r as MandiCandidate;
    const held = bestPerMandi.get(r.id);
    if (!held || preferPrice(candidate, held)) bestPerMandi.set(r.id, candidate);
  }
  return [...bestPerMandi.values()];
}

export interface RecommendationRequest {
  cropId: string;
  quantityKg: number;
  grade: "A" | "B" | "C";
  harvestedAt: Date;
  origin: { lat: number; lng: number };
  radiusKm: number;
}

/**
 * The core farmer query: where should this harvest go?
 *
 * Returns mandis ranked by what the farmer actually takes home, with any existing
 * pooled truck already priced in — because a shared truck often changes the answer.
 */
export async function recommend(req: RecommendationRequest) {
  const db = await getDb();

  const [crop] = await db
    .select()
    .from(crops)
    .where(eq(crops.id, req.cropId))
    .limit(1);
  if (!crop) throw new Error(`Unknown crop: ${req.cropId}`);

  const candidates = await latestPrices(req.cropId);

  // Find open trips a farmer could join, so pooled pricing feeds into the ranking
  // rather than being discovered only after the mandi has been chosen.
  const openTrips = await findJoinableTrips(req.origin, req.quantityKg);

  const pooledOffers: Record<
    string,
    { costForThisLoad: number; tripId: string; departAt: Date; seatsKg: number }
  > = {};

  for (const trip of openTrips) {
    const existing = pooledOffers[trip.mandiId];
    // Where several trips serve one mandi, quote the cheapest.
    if (!existing || trip.quote < existing.costForThisLoad) {
      pooledOffers[trip.mandiId] = {
        costForThisLoad: trip.quote,
        tripId: trip.id,
        departAt: trip.departAt,
        seatsKg: trip.capacityKg - trip.usedKg,
      };
    }
  }

  const hoursSinceHarvest = Math.max(
    0,
    (Date.now() - req.harvestedAt.getTime()) / 3_600_000,
  );

  const ranked = rankMandis({
    origin: req.origin,
    quantityKg: req.quantityKg,
    grade: req.grade,
    hoursSinceHarvest,
    crop: {
      spoilageRatePerDay: crop.spoilageRatePerDay,
      shelfLifeHours: crop.shelfLifeHours,
    },
    candidates,
    radiusKm: req.radiusKm,
    soloRatePerKm: DEFAULT_RATE_PER_KM,
    pooledOffers,
  });

  return { crop, ranked, pooledOffers, openTrips };
}

/* -------------------------------------------------------------- pooling */

export interface JoinableTrip {
  id: string;
  mandiId: string;
  mandiName: string;
  truckId: string;
  regNo: string;
  vehicleType: string;
  operatorName: string;
  departAt: Date;
  capacityKg: number;
  usedKg: number;
  baseDistanceKm: number;
  totalCost: number;
  ratePerKm: number;
  originName: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  /** Detour the truck would make to reach this farmer. */
  detourKm: number;
  /** What this farmer would be quoted to join. */
  quote: number;
  farmerCount: number;
}

/** Open trips with room, departing later than now, reachable without an absurd detour. */
export async function findJoinableTrips(
  origin: { lat: number; lng: number },
  quantityKg: number,
  maxDetourKm = 40,
): Promise<JoinableTrip[]> {
  const db = await getDb();

  const rows = await db
    .select({
      id: trips.id,
      mandiId: trips.mandiId,
      mandiName: mandis.name,
      mandiLat: mandis.lat,
      mandiLng: mandis.lng,
      truckId: trips.truckId,
      regNo: trucks.regNo,
      vehicleType: trucks.vehicleType,
      operatorName: users.name,
      departAt: trips.departAt,
      capacityKg: trips.capacityKg,
      usedKg: trips.usedKg,
      baseDistanceKm: trips.baseDistanceKm,
      totalCost: trips.totalCost,
      ratePerKm: trucks.ratePerKm,
      originName: trips.originName,
      originLat: trips.originLat,
      originLng: trips.originLng,
    })
    .from(trips)
    .innerJoin(trucks, eq(trucks.id, trips.truckId))
    .innerJoin(users, eq(users.id, trucks.operatorId))
    .innerJoin(mandis, eq(mandis.id, trips.mandiId))
    .where(
      and(
        eq(trips.status, "OPEN"),
        gte(trips.departAt, new Date()),
        sql`${trips.capacityKg} - ${trips.usedKg} >= ${quantityKg}`,
      ),
    )
    .orderBy(trips.departAt);

  const counts = await loadCounts(rows.map((r) => r.id));

  return rows
    .map((r): JoinableTrip => {
      const detour = detourKm(
        { lat: r.originLat, lng: r.originLng },
        origin,
        { lat: r.mandiLat, lng: r.mandiLng },
      );
      return {
        ...r,
        destLat: r.mandiLat,
        destLng: r.mandiLng,
        detourKm: detour,
        quote: pooledQuote(
          quantityKg,
          r.capacityKg,
          r.totalCost,
          detour,
          r.ratePerKm,
        ),
        farmerCount: counts.get(r.id) ?? 0,
      };
    })
    .filter((t) => t.detourKm <= maxDetourKm)
    .sort((a, b) => a.quote - b.quote);
}

async function loadCounts(tripIds: string[]): Promise<Map<string, number>> {
  if (tripIds.length === 0) return new Map();
  const db = await getDb();
  const rows = await db
    .select({ tripId: loads.tripId, id: loads.id })
    .from(loads)
    .where(
      and(
        inArray(loads.tripId, tripIds),
        inArray(loads.status, ["CONFIRMED", "PICKED_UP", "DELIVERED"]),
      ),
    );

  const map = new Map<string, number>();
  for (const r of rows) map.set(r.tripId, (map.get(r.tripId) ?? 0) + 1);
  return map;
}

/** A farmer asks to put a load on an existing trip. */
export async function requestJoin(opts: {
  tripId: string;
  farmerId: string;
  listingId?: string;
  cropId: string;
  quantityKg: number;
  grade: "A" | "B" | "C";
  pickupName: string;
  pickupLat: number;
  pickupLng: number;
}) {
  const db = await getDb();

  const [trip] = await db
    .select({
      id: trips.id,
      status: trips.status,
      capacityKg: trips.capacityKg,
      usedKg: trips.usedKg,
      originLat: trips.originLat,
      originLng: trips.originLng,
      mandiLat: mandis.lat,
      mandiLng: mandis.lng,
      mandiName: mandis.name,
      operatorId: trucks.operatorId,
    })
    .from(trips)
    .innerJoin(mandis, eq(mandis.id, trips.mandiId))
    .innerJoin(trucks, eq(trucks.id, trips.truckId))
    .where(eq(trips.id, opts.tripId))
    .limit(1);

  if (!trip) throw new Error("Trip not found");
  if (trip.status !== "OPEN") throw new Error("This trip is no longer accepting loads");
  if (trip.capacityKg - trip.usedKg < opts.quantityKg) {
    throw new Error("Not enough space left on this truck");
  }

  const detour = detourKm(
    { lat: trip.originLat, lng: trip.originLng },
    { lat: opts.pickupLat, lng: opts.pickupLng },
    { lat: trip.mandiLat, lng: trip.mandiLng },
  );

  const [load] = await db
    .insert(loads)
    .values({
      tripId: opts.tripId,
      farmerId: opts.farmerId,
      listingId: opts.listingId,
      cropId: opts.cropId,
      quantityKg: opts.quantityKg,
      grade: opts.grade,
      pickupName: opts.pickupName,
      pickupLat: opts.pickupLat,
      pickupLng: opts.pickupLng,
      detourKm: detour,
      status: "REQUESTED",
    })
    .returning();

  if (opts.listingId) {
    await db
      .update(listings)
      .set({ status: "BOOKED" })
      .where(eq(listings.id, opts.listingId));
  }

  const [farmer] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, opts.farmerId))
    .limit(1);

  await notify({
    userId: trip.operatorId,
    type: "POOLING_ALERT",
    title: "New load request",
    body: `${farmer?.name ?? "A farmer"} wants to add ${opts.quantityKg} kg to your ${trip.mandiName} trip (${detour} km detour).`,
    titleHi: "नया लोड अनुरोध",
    bodyHi: `${farmer?.name ?? "एक किसान"} आपकी ${trip.mandiName} यात्रा में ${opts.quantityKg} किलो जोड़ना चाहते हैं।`,
    channel: "PUSH",
    href: `/operator/trip/${opts.tripId}`,
  });

  return load;
}

/**
 * Operator accepts a load. This is the moment capacity is committed, every farmer's
 * share is recalculated, and the payable plus its 7-day reminder are written.
 */
export async function acceptLoad(loadId: string, operatorId: string) {
  const db = await getDb();

  const [row] = await db
    .select({
      load: loads,
      trip: trips,
      ratePerKm: trucks.ratePerKm,
      operatorId: trucks.operatorId,
      mandiName: mandis.name,
    })
    .from(loads)
    .innerJoin(trips, eq(trips.id, loads.tripId))
    .innerJoin(trucks, eq(trucks.id, trips.truckId))
    .innerJoin(mandis, eq(mandis.id, trips.mandiId))
    .where(eq(loads.id, loadId))
    .limit(1);

  if (!row) throw new Error("Load not found");
  if (row.operatorId !== operatorId) throw new Error("Not your trip");
  if (row.load.status !== "REQUESTED") throw new Error("Already decided");

  const used = row.trip.usedKg + row.load.quantityKg;
  if (used > row.trip.capacityKg) throw new Error("Not enough space left");

  await db
    .update(loads)
    .set({ status: "CONFIRMED" })
    .where(eq(loads.id, loadId));

  await db
    .update(trips)
    .set({
      usedKg: used,
      status: used >= row.trip.capacityKg ? "FULL" : "OPEN",
    })
    .where(eq(trips.id, row.trip.id));

  await resplit(row.trip.id, row.ratePerKm);

  // Charge the newly confirmed farmer, with the FR-9 reminder scheduled alongside.
  const [fresh] = await db
    .select({ costShare: loads.costShare })
    .from(loads)
    .where(eq(loads.id, loadId))
    .limit(1);

  const dueDate = new Date(
    row.trip.departAt.getTime() + PAYMENT_TERM_DAYS * 24 * 60 * 60 * 1000,
  );

  await chargeWithReminder({
    userId: row.load.farmerId,
    loadId,
    tripId: row.trip.id,
    kind: "TRANSPORT_CHARGE",
    amount: fresh?.costShare ?? 0,
    dueDate,
    mandiName: row.mandiName,
    note: `Transport share, ${row.mandiName}`,
  });

  await notify({
    userId: row.load.farmerId,
    type: "POOLING_ALERT",
    title: "You are on the truck",
    body: `Your load is confirmed for the ${row.mandiName} trip. Your share is ₹${fresh?.costShare ?? 0}. Have the produce ready at pickup.`,
    titleHi: "आपका लोड पक्का हो गया",
    bodyHi: `${row.mandiName} यात्रा के लिए आपका लोड पक्का है। आपका हिस्सा ₹${fresh?.costShare ?? 0} है।`,
    channel: "PUSH",
    href: `/farmer/trip/${row.trip.id}`,
  });

  return { ok: true };
}

export async function rejectLoad(loadId: string, operatorId: string) {
  const db = await getDb();

  const [row] = await db
    .select({ load: loads, operatorId: trucks.operatorId })
    .from(loads)
    .innerJoin(trips, eq(trips.id, loads.tripId))
    .innerJoin(trucks, eq(trucks.id, trips.truckId))
    .where(eq(loads.id, loadId))
    .limit(1);

  if (!row) throw new Error("Load not found");
  if (row.operatorId !== operatorId) throw new Error("Not your trip");

  await db.update(loads).set({ status: "REJECTED" }).where(eq(loads.id, loadId));

  if (row.load.listingId) {
    await db
      .update(listings)
      .set({ status: "OPEN" })
      .where(eq(listings.id, row.load.listingId));
  }

  await notify({
    userId: row.load.farmerId,
    type: "POOLING_ALERT",
    title: "Load request declined",
    body: "The truck owner could not take your load. Look for another truck — there may be a better option.",
    titleHi: "लोड अनुरोध अस्वीकार",
    bodyHi: "ट्रक मालिक आपका लोड नहीं ले सके। दूसरा ट्रक देखें।",
    channel: "PUSH",
    href: "/farmer/sell",
  });
}

/**
 * Recalculate every farmer's share on a trip.
 *
 * Called whenever the load set changes. Shares are always derived, never edited by
 * hand, so the fairness rule in `costs.ts` holds for every farmer on every trip.
 */
export async function resplit(tripId: string, ratePerKm: number) {
  const db = await getDb();

  const [trip] = await db
    .select()
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  if (!trip) return;

  const confirmed = await db
    .select({
      id: loads.id,
      quantityKg: loads.quantityKg,
      detourKm: loads.detourKm,
    })
    .from(loads)
    .where(
      and(
        eq(loads.tripId, tripId),
        inArray(loads.status, ["CONFIRMED", "PICKED_UP", "DELIVERED"]),
      ),
    );

  const shares = splitCost(confirmed, trip.totalCost, ratePerKm);

  for (const s of shares) {
    await db
      .update(loads)
      .set({ costShare: s.total })
      .where(eq(loads.id, s.id));
  }

  return shares;
}

/* ---------------------------------------------------------------- trips */

/** An operator opens a run to a mandi and offers its space to nearby farmers. */
export async function createTrip(opts: {
  truckId: string;
  operatorId: string;
  mandiId: string;
  originName: string;
  originLat: number;
  originLng: number;
  departAt: Date;
}) {
  const db = await getDb();

  const [truck] = await db
    .select()
    .from(trucks)
    .where(
      and(eq(trucks.id, opts.truckId), eq(trucks.operatorId, opts.operatorId)),
    )
    .limit(1);
  if (!truck) throw new Error("Truck not found");

  const [mandi] = await db
    .select()
    .from(mandis)
    .where(eq(mandis.id, opts.mandiId))
    .limit(1);
  if (!mandi) throw new Error("Mandi not found");

  const distance = roadDistanceKm(
    { lat: opts.originLat, lng: opts.originLng },
    { lat: mandi.lat, lng: mandi.lng },
  );

  const [trip] = await db
    .insert(trips)
    .values({
      truckId: truck.id,
      mandiId: mandi.id,
      originName: opts.originName,
      originLat: opts.originLat,
      originLng: opts.originLng,
      departAt: opts.departAt,
      capacityKg: truck.capacityKg,
      usedKg: 0,
      totalCost: tripCost(distance, truck.ratePerKm),
      baseDistanceKm: distance,
      status: "OPEN",
    })
    .returning();

  await db
    .update(trucks)
    .set({ status: "ON_TRIP" })
    .where(eq(trucks.id, truck.id));

  // FR-8: tell farmers near this route that a truck is going their way. This is the
  // "Notify farmer if a truck is scheduled in their area" line from the PDD §2.
  await alertNearbyFarmers(trip.id, mandi.name, {
    lat: opts.originLat,
    lng: opts.originLng,
  });

  return trip;
}

/** Farmers within reach of a new trip's origin hear about it. */
async function alertNearbyFarmers(
  tripId: string,
  mandiName: string,
  origin: { lat: number; lng: number },
  radiusKm = 35,
) {
  const db = await getDb();

  const nearby = await db
    .select({ id: users.id, lat: users.lat, lng: users.lng })
    .from(users)
    .where(eq(users.role, "FARMER"));

  const targets = nearby.filter(
    (f) =>
      f.lat != null &&
      f.lng != null &&
      roadDistanceKm(origin, { lat: f.lat, lng: f.lng }) <= radiusKm,
  );

  await Promise.all(
    targets.map((f) =>
      notify({
        userId: f.id,
        type: "POOLING_ALERT",
        title: `Truck going to ${mandiName}`,
        body: `A truck is leaving your area for ${mandiName} and has space. Share it to cut your transport cost.`,
        titleHi: `${mandiName} जा रहा ट्रक`,
        bodyHi: `आपके क्षेत्र से ${mandiName} के लिए एक ट्रक जा रहा है और उसमें जगह है। साझा करके ढुलाई खर्च घटाएँ।`,
        channel: "PUSH",
        href: `/farmer/trip/${tripId}`,
      }),
    ),
  );
}

/** "Best fill" for an operator: which pending requests should this truck take? */
export async function bestFillFor(tripId: string, operatorId: string) {
  const db = await getDb();

  const [row] = await db
    .select({
      trip: trips,
      ratePerKm: trucks.ratePerKm,
      operatorId: trucks.operatorId,
      mandiLat: mandis.lat,
      mandiLng: mandis.lng,
    })
    .from(trips)
    .innerJoin(trucks, eq(trucks.id, trips.truckId))
    .innerJoin(mandis, eq(mandis.id, trips.mandiId))
    .where(eq(trips.id, tripId))
    .limit(1);

  if (!row) throw new Error("Trip not found");
  if (row.operatorId !== operatorId) throw new Error("Not your trip");

  const pending = await db
    .select({
      id: loads.id,
      farmerId: loads.farmerId,
      farmerName: users.name,
      cropId: loads.cropId,
      cropName: crops.name,
      quantityKg: loads.quantityKg,
      pickupName: loads.pickupName,
      pickupLat: loads.pickupLat,
      pickupLng: loads.pickupLng,
    })
    .from(loads)
    .innerJoin(users, eq(users.id, loads.farmerId))
    .innerJoin(crops, eq(crops.id, loads.cropId))
    .where(and(eq(loads.tripId, tripId), eq(loads.status, "REQUESTED")));

  const ctx = {
    origin: { lat: row.trip.originLat, lng: row.trip.originLng },
    destination: { lat: row.mandiLat, lng: row.mandiLng },
    capacityKg: row.trip.capacityKg,
    usedKg: row.trip.usedKg,
    totalCost: row.trip.totalCost,
    ratePerKm: row.ratePerKm,
    departAt: row.trip.departAt,
  };

  const scored = scoreLoads(
    pending.map((p) => ({
      ...p,
      // Requests carry no separate deadline yet; the trip's departure governs.
      dispatchBy: row.trip.departAt,
    })),
    ctx,
  );

  return { fill: bestFill(scored, ctx), trip: row.trip, ratePerKm: row.ratePerKm };
}

/** Move a trip along its lifecycle and tell everyone riding on it. */
export async function setTripStatus(
  tripId: string,
  operatorId: string,
  status: "IN_TRANSIT" | "DELIVERED" | "CANCELLED",
) {
  const db = await getDb();

  const [row] = await db
    .select({
      trip: trips,
      operatorId: trucks.operatorId,
      truckId: trucks.id,
      mandiName: mandis.name,
    })
    .from(trips)
    .innerJoin(trucks, eq(trucks.id, trips.truckId))
    .innerJoin(mandis, eq(mandis.id, trips.mandiId))
    .where(eq(trips.id, tripId))
    .limit(1);

  if (!row) throw new Error("Trip not found");
  if (row.operatorId !== operatorId) throw new Error("Not your trip");

  await db.update(trips).set({ status }).where(eq(trips.id, tripId));

  const loadStatus =
    status === "IN_TRANSIT"
      ? "PICKED_UP"
      : status === "DELIVERED"
        ? "DELIVERED"
        : "CANCELLED";

  await db
    .update(loads)
    .set({ status: loadStatus })
    .where(
      and(
        eq(loads.tripId, tripId),
        inArray(loads.status, ["CONFIRMED", "PICKED_UP"]),
      ),
    );

  if (status !== "IN_TRANSIT") {
    await db
      .update(trucks)
      .set({ status: "AVAILABLE" })
      .where(eq(trucks.id, row.truckId));
  }

  const riders = await db
    .select({ farmerId: loads.farmerId })
    .from(loads)
    .where(eq(loads.tripId, tripId));

  const copy = {
    IN_TRANSIT: {
      title: `Truck on the way to ${row.mandiName}`,
      body: "Your produce is on the truck. Follow it live in the app.",
      titleHi: `ट्रक ${row.mandiName} की ओर रवाना`,
      bodyHi: "आपकी उपज ट्रक पर है। ऐप में लाइव देखें।",
    },
    DELIVERED: {
      title: `Delivered at ${row.mandiName}`,
      body: "Your produce has reached the mandi. Your income summary is ready.",
      titleHi: `${row.mandiName} पहुँच गया`,
      bodyHi: "आपकी उपज मंडी पहुँच गई है। आपका हिसाब तैयार है।",
    },
    CANCELLED: {
      title: "Trip cancelled",
      body: "This trip was cancelled. Look for another truck.",
      titleHi: "यात्रा रद्द",
      bodyHi: "यह यात्रा रद्द कर दी गई। दूसरा ट्रक देखें।",
    },
  }[status];

  await notifyTripWatchers(
    [...new Set(riders.map((r) => r.farmerId))],
    tripId,
    copy.title,
    copy.body,
    copy.titleHi,
    copy.bodyHi,
  );
}

/** What pooling actually saved a farmer, for the "you saved" line in the UI. */
export function poolingSaving(
  quantityKg: number,
  distanceKm: number,
  pooledShare: number,
  ratePerKm = DEFAULT_RATE_PER_KM,
) {
  void quantityKg;
  return savings(soloCost(distanceKm, ratePerKm), pooledShare);
}
