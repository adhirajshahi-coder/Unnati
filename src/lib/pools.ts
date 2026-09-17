/**
 * Farmer-led pooling groups.
 *
 * The trip-based pooling in `booking.ts` only helps a farmer when an operator has
 * already opened a run to the mandi they want. A smallholder with ten quintal usually
 * has no such run to join, and the app was quoting them a whole vehicle — which is
 * precisely the problem this product exists to solve.
 *
 * So the farmer starts the group instead. Neighbours going the same way join, the
 * cost per farmer falls as weight accumulates, and once the group is worth a vehicle
 * an operator claims it and it becomes an ordinary trip. Demand organises itself
 * before any supply is committed. PRD §5.2 describes exactly this; it was the half
 * that was missing.
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  pools,
  poolMembers,
  mandis,
  users,
  trips,
  trucks,
  loads,
  listings,
  crops,
} from "@/db/schema";
import { roadDistanceKm, detourKm } from "@/lib/engine/geo";
import { pickVehicle, VIABLE_FILL } from "@/lib/engine/grouping";
import { createTrip, resplit, PAYMENT_TERM_DAYS } from "@/lib/booking";
import { chargeWithReminder, notify } from "@/lib/notifications";

/** A single smallholder load is not a group; aim at least one vehicle size up. */
const GROUP_TARGET_FLOOR_KG = 2000;

/** How far off a group's route we will still collect from a farmer. */
const MAX_JOIN_DETOUR_KM = 40;

/* ------------------------------------------------------------- reading */

/** Weight and headcount per group, in one query rather than one per group. */
async function poolTotals(poolIds: string[]) {
  const map = new Map<string, { kg: number; count: number }>();
  if (poolIds.length === 0) return map;

  const db = await getDb();
  const rows = await db
    .select({
      poolId: poolMembers.poolId,
      kg: sql<number>`coalesce(sum(${poolMembers.quantityKg}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(poolMembers)
    .where(inArray(poolMembers.poolId, poolIds))
    .groupBy(poolMembers.poolId);

  for (const r of rows) map.set(r.poolId, { kg: r.kg, count: r.count });
  return map;
}

/**
 * Groups a farmer could join: same mandi, still leaving in the future, close enough
 * that collecting them does not wreck the route.
 */
export async function findJoinablePools(
  origin: { lat: number; lng: number },
  mandiId?: string,
  maxDetourKm = MAX_JOIN_DETOUR_KM,
) {
  const db = await getDb();

  const rows = await db
    .select({
      id: pools.id,
      mandiId: pools.mandiId,
      mandiName: mandis.name,
      mandiNameHi: mandis.nameHi,
      mandiLat: mandis.lat,
      mandiLng: mandis.lng,
      originName: pools.originName,
      originLat: pools.originLat,
      originLng: pools.originLng,
      targetDepartAt: pools.targetDepartAt,
      targetCapacityKg: pools.targetCapacityKg,
      distanceKm: pools.distanceKm,
      status: pools.status,
      createdBy: pools.createdBy,
      startedBy: users.name,
    })
    .from(pools)
    .innerJoin(mandis, eq(mandis.id, pools.mandiId))
    .innerJoin(users, eq(users.id, pools.createdBy))
    .where(
      and(
        inArray(pools.status, ["OPEN", "READY"]),
        gte(pools.targetDepartAt, new Date()),
        ...(mandiId ? [eq(pools.mandiId, mandiId)] : []),
      ),
    )
    .orderBy(pools.targetDepartAt);

  const totals = await poolTotals(rows.map((r) => r.id));

  return rows
    .map((r) => ({
      ...r,
      committedKg: totals.get(r.id)?.kg ?? 0,
      memberCount: totals.get(r.id)?.count ?? 0,
      detourKm: detourKm(
        { lat: r.originLat, lng: r.originLng },
        origin,
        { lat: r.mandiLat, lng: r.mandiLng },
      ),
    }))
    .filter((p) => p.detourKm <= maxDetourKm)
    .sort((a, b) => b.committedKg - a.committedKg);
}

/** Everything the group's own page needs. */
export async function poolDetail(poolId: string) {
  const db = await getDb();

  const [pool] = await db
    .select({
      id: pools.id,
      mandiId: pools.mandiId,
      mandiName: mandis.name,
      mandiNameHi: mandis.nameHi,
      originName: pools.originName,
      originLat: pools.originLat,
      originLng: pools.originLng,
      targetDepartAt: pools.targetDepartAt,
      targetCapacityKg: pools.targetCapacityKg,
      distanceKm: pools.distanceKm,
      status: pools.status,
      createdBy: pools.createdBy,
      tripId: pools.tripId,
      startedBy: users.name,
    })
    .from(pools)
    .innerJoin(mandis, eq(mandis.id, pools.mandiId))
    .innerJoin(users, eq(users.id, pools.createdBy))
    .where(eq(pools.id, poolId))
    .limit(1);

  if (!pool) return null;

  const members = await db
    .select({
      id: poolMembers.id,
      farmerId: poolMembers.farmerId,
      farmerName: users.name,
      village: users.village,
      quantityKg: poolMembers.quantityKg,
      grade: poolMembers.grade,
      pickupName: poolMembers.pickupName,
      detourKm: poolMembers.detourKm,
      cropName: crops.name,
      cropNameHi: crops.nameHi,
    })
    .from(poolMembers)
    .innerJoin(users, eq(users.id, poolMembers.farmerId))
    .innerJoin(crops, eq(crops.id, poolMembers.cropId))
    .where(eq(poolMembers.poolId, poolId))
    .orderBy(poolMembers.createdAt);

  const committedKg = members.reduce((s, m) => s + m.quantityKg, 0);
  return { pool, members, committedKg };
}

/** Groups an operator could pick up, fullest first. */
export async function poolsAwaitingTruck(operatorOrigin: {
  lat: number;
  lng: number;
}) {
  const all = await findJoinablePools(operatorOrigin, undefined, 60);
  return all.filter((p) => p.committedKg > 0);
}

/* ------------------------------------------------------------- writing */

export interface JoinPoolInput {
  farmerId: string;
  mandiId: string;
  cropId: string;
  quantityKg: number;
  grade: "A" | "B" | "C";
  pickupName: string;
  pickupLat: number;
  pickupLng: number;
  listingId?: string;
  departAt: Date;
  /** Join this specific group; otherwise the best nearby one, or start a new one. */
  poolId?: string;
}

/**
 * Put a farmer into a group heading to a mandi, creating the group if none fits.
 *
 * Joining an existing group always wins over starting a parallel one: two half-full
 * groups to the same mandi on the same day help nobody, and the entire point is to
 * concentrate demand until it is worth a truck.
 */
export async function joinOrStartPool(input: JoinPoolInput) {
  const db = await getDb();

  const [mandi] = await db
    .select()
    .from(mandis)
    .where(eq(mandis.id, input.mandiId))
    .limit(1);
  if (!mandi) throw new Error("Mandi not found");

  const origin = { lat: input.pickupLat, lng: input.pickupLng };
  let poolId = input.poolId;
  let created = false;

  if (!poolId) {
    const candidates = await findJoinablePools(origin, input.mandiId);
    // The fullest nearby group, since that is the one closest to actually running.
    poolId = candidates[0]?.id;
  }

  if (!poolId) {
    const distance = roadDistanceKm(origin, { lat: mandi.lat, lng: mandi.lng });
    const target = pickVehicle(
      Math.max(input.quantityKg, GROUP_TARGET_FLOOR_KG),
    );

    const [row] = await db
      .insert(pools)
      .values({
        mandiId: input.mandiId,
        originName: input.pickupName,
        originLat: input.pickupLat,
        originLng: input.pickupLng,
        targetDepartAt: input.departAt,
        targetCapacityKg: target.capacityKg,
        distanceKm: distance,
        status: "OPEN",
        createdBy: input.farmerId,
      })
      .returning();

    poolId = row.id;
    created = true;
  }

  const [pool] = await db
    .select()
    .from(pools)
    .where(eq(pools.id, poolId))
    .limit(1);
  if (!pool) throw new Error("Group not found");
  if (pool.status !== "OPEN" && pool.status !== "READY") {
    throw new Error("This group is no longer taking loads");
  }

  const memberDetour = detourKm(
    { lat: pool.originLat, lng: pool.originLng },
    origin,
    { lat: mandi.lat, lng: mandi.lng },
  );

  // Enforced here, not only when browsing. A farmer arriving with a group id — from a
  // shared link or a notification — would otherwise be signed up for a detour charge
  // that can exceed what hiring their own truck would have cost, which is the exact
  // opposite of what this feature is for.
  if (memberDetour > MAX_JOIN_DETOUR_KM) {
    throw new Error(
      `That group leaves from ${pool.originName}, and collecting from you would add ${Math.round(memberDetour)} km to the run. Start your own group instead — joining this one would cost you more than travelling alone.`,
    );
  }

  // Already a member? Treat a second tap as a no-op rather than double-booking.
  const [existing] = await db
    .select({ id: poolMembers.id })
    .from(poolMembers)
    .where(
      and(eq(poolMembers.poolId, poolId), eq(poolMembers.farmerId, input.farmerId)),
    )
    .limit(1);

  if (!existing) {
    await db.insert(poolMembers).values({
      poolId,
      farmerId: input.farmerId,
      listingId: input.listingId,
      cropId: input.cropId,
      quantityKg: input.quantityKg,
      grade: input.grade,
      pickupName: input.pickupName,
      pickupLat: input.pickupLat,
      pickupLng: input.pickupLng,
      detourKm: memberDetour,
    });

    if (input.listingId) {
      await db
        .update(listings)
        .set({ status: "BOOKED" })
        .where(eq(listings.id, input.listingId));
    }
  }

  if (created) {
    await alertNeighbours(
      poolId,
      mandi.name,
      origin,
      input.farmerId,
      input.quantityKg,
    );
  }

  await refreshPoolStatus(poolId);
  return { poolId, created };
}

/**
 * Recompute whether a group is worth a truck yet, and say so when it becomes one.
 *
 * READY is the moment the group stops being a hope and becomes a booking an operator
 * will actually take, which is worth telling everyone waiting on it.
 */
export async function refreshPoolStatus(poolId: string) {
  const db = await getDb();

  const [pool] = await db
    .select()
    .from(pools)
    .where(eq(pools.id, poolId))
    .limit(1);
  if (!pool || (pool.status !== "OPEN" && pool.status !== "READY")) return;

  const committedKg = (await poolTotals([poolId])).get(poolId)?.kg ?? 0;
  const next =
    committedKg >= pool.targetCapacityKg * VIABLE_FILL ? "READY" : "OPEN";

  if (next === pool.status) return;

  await db.update(pools).set({ status: next }).where(eq(pools.id, poolId));
  if (next !== "READY") return;

  const [mandi] = await db
    .select({ name: mandis.name })
    .from(mandis)
    .where(eq(mandis.id, pool.mandiId))
    .limit(1);

  const members = await db
    .select({ farmerId: poolMembers.farmerId })
    .from(poolMembers)
    .where(eq(poolMembers.poolId, poolId));

  await Promise.all(
    members.map((m) =>
      notify({
        userId: m.farmerId,
        type: "POOLING_ALERT",
        title: "Your group has enough load for a truck",
        body: `The group going to ${mandi?.name ?? "the mandi"} has reached ${committedKg} kg. Truck owners can take it from here.`,
        titleHi: "आपके समूह में ट्रक भरने लायक माल हो गया",
        bodyHi: `${mandi?.name ?? "मंडी"} जाने वाले समूह में ${committedKg} किलो हो गया है। अब ट्रक मालिक इसे ले सकते हैं।`,
        channel: "PUSH",
        href: `/farmer/pool/${poolId}`,
        // unnati_pooling_alert: mandi, farmer count, weight gathered.
        whatsapp: [
          mandi?.name ?? "the mandi",
          String(members.length),
          `${committedKg} kg`,
        ],
      }),
    ),
  );
}

/** Tell farmers nearby that a neighbour is gathering a load for a mandi. */
async function alertNeighbours(
  poolId: string,
  mandiName: string,
  origin: { lat: number; lng: number },
  starterId: string,
  startingKg: number,
  radiusKm = 30,
) {
  const db = await getDb();

  const farmers = await db
    .select({ id: users.id, lat: users.lat, lng: users.lng })
    .from(users)
    .where(eq(users.role, "FARMER"));

  const targets = farmers.filter(
    (f) =>
      f.id !== starterId &&
      f.lat != null &&
      f.lng != null &&
      roadDistanceKm(origin, { lat: f.lat, lng: f.lng }) <= radiusKm,
  );

  await Promise.all(
    targets.map((f) =>
      notify({
        userId: f.id,
        type: "POOLING_ALERT",
        title: `Neighbours are gathering a load for ${mandiName}`,
        body: "Join them and split one truck instead of hiring your own. The more farmers who join, the less each of you pays.",
        titleHi: `${mandiName} के लिए पड़ोसी माल जोड़ रहे हैं`,
        bodyHi:
          "उनके साथ जुड़कर एक ही ट्रक साझा करें। जितने ज़्यादा किसान, उतना कम खर्च।",
        channel: "PUSH",
        href: `/farmer/pool/${poolId}`,
        // The message most worth a farmer's phone buzzing: a truck they could share
        // is being assembled a few kilometres away, and the window is hours long.
        // unnati_pooling_alert: mandi, farmer count, weight gathered.
        whatsapp: [mandiName, "1", `${startingKg} kg`],
      }),
    ),
  );
}

/** A farmer withdraws from a group. */
export async function leavePool(poolId: string, farmerId: string) {
  const db = await getDb();

  const [member] = await db
    .select()
    .from(poolMembers)
    .where(
      and(eq(poolMembers.poolId, poolId), eq(poolMembers.farmerId, farmerId)),
    )
    .limit(1);
  if (!member) return;

  await db.delete(poolMembers).where(eq(poolMembers.id, member.id));

  if (member.listingId) {
    await db
      .update(listings)
      .set({ status: "OPEN" })
      .where(eq(listings.id, member.listingId));
  }

  await refreshPoolStatus(poolId);
}

/**
 * An operator takes a group and turns it into a real trip.
 *
 * Every member becomes a confirmed load, shares are computed by the same rule as on
 * any other trip, and each farmer is charged with the seven-day reminder attached.
 * From here it is an ordinary booking — tracking, cost-split and settlement all work
 * without needing to know the group began on the demand side.
 */
export async function claimPool(
  poolId: string,
  operatorId: string,
  truckId: string,
) {
  const db = await getDb();

  const [pool] = await db
    .select()
    .from(pools)
    .where(eq(pools.id, poolId))
    .limit(1);
  if (!pool) throw new Error("Group not found");
  if (pool.status === "MATCHED") {
    throw new Error("Another truck already took this group");
  }
  if (pool.status === "CANCELLED" || pool.status === "EXPIRED") {
    throw new Error("This group is closed");
  }

  const [truck] = await db
    .select()
    .from(trucks)
    .where(and(eq(trucks.id, truckId), eq(trucks.operatorId, operatorId)))
    .limit(1);
  if (!truck) throw new Error("Truck not found");

  const members = await db
    .select()
    .from(poolMembers)
    .where(eq(poolMembers.poolId, poolId));
  if (members.length === 0) throw new Error("This group is empty");

  const totalKg = members.reduce((s, m) => s + m.quantityKg, 0);
  if (totalKg > truck.capacityKg) {
    throw new Error(
      `This group is ${totalKg} kg and that truck carries ${truck.capacityKg} kg`,
    );
  }

  const trip = await createTrip({
    truckId,
    operatorId,
    mandiId: pool.mandiId,
    originName: pool.originName,
    originLat: pool.originLat,
    originLng: pool.originLng,
    departAt: pool.targetDepartAt,
  });

  await db.insert(loads).values(
    members.map((m) => ({
      tripId: trip.id,
      farmerId: m.farmerId,
      listingId: m.listingId,
      cropId: m.cropId,
      quantityKg: m.quantityKg,
      grade: m.grade,
      pickupName: m.pickupName,
      pickupLat: m.pickupLat,
      pickupLng: m.pickupLng,
      detourKm: m.detourKm,
      status: "CONFIRMED" as const,
    })),
  );

  await db
    .update(trips)
    .set({
      usedKg: totalKg,
      status: totalKg >= truck.capacityKg ? "FULL" : "OPEN",
    })
    .where(eq(trips.id, trip.id));

  await resplit(trip.id, truck.ratePerKm);

  await db
    .update(pools)
    .set({ status: "MATCHED", tripId: trip.id })
    .where(eq(pools.id, poolId));

  const priced = await db
    .select({
      id: loads.id,
      farmerId: loads.farmerId,
      costShare: loads.costShare,
    })
    .from(loads)
    .where(eq(loads.tripId, trip.id));

  const [mandi] = await db
    .select({ name: mandis.name })
    .from(mandis)
    .where(eq(mandis.id, pool.mandiId))
    .limit(1);

  const dueDate = new Date(
    pool.targetDepartAt.getTime() + PAYMENT_TERM_DAYS * 24 * 60 * 60 * 1000,
  );

  for (const load of priced) {
    await chargeWithReminder({
      userId: load.farmerId,
      loadId: load.id,
      tripId: trip.id,
      kind: "TRANSPORT_CHARGE",
      amount: load.costShare,
      dueDate,
      mandiName: mandi?.name,
      note: `Transport share, ${mandi?.name ?? "mandi"}`,
    });

    await notify({
      userId: load.farmerId,
      type: "POOLING_ALERT",
      title: "A truck has taken your group",
      body: `${truck.vehicleType} (${truck.regNo}) will carry your group to ${mandi?.name ?? "the mandi"}. Your share is ₹${load.costShare}.`,
      titleHi: "आपके समूह को ट्रक मिल गया",
      bodyHi: `${truck.vehicleType} (${truck.regNo}) आपके समूह को ${mandi?.name ?? "मंडी"} ले जाएगा। आपका हिस्सा ₹${load.costShare} है।`,
      channel: "PUSH",
      href: `/farmer/trip/${trip.id}`,
    });
  }

  return { tripId: trip.id };
}
