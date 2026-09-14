import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { pools, poolMembers, mandis, users } from "@/db/schema";
import { requireUser, AuthError } from "@/lib/auth";
import { notify } from "@/lib/notifications";
import { roadDistanceKm } from "@/lib/engine/geo";
import { weight } from "@/lib/i18n";

const schema = z.object({
  farmerId: z.string().min(1),
  poolId: z.string().min(1),
});

/** Nobody should be invited to collect from 300 km away. */
const REACH_KM = 60;

/**
 * Invite a nearby farmer into a group you are in.
 *
 * The invitation is a notification with a link — the other farmer joins, or does not.
 * Adding someone to a booking on their behalf would commit them to a charge they
 * never agreed to, so this only ever asks.
 *
 * You must be in the group yourself to invite to it, which keeps this from becoming a
 * way to push messages at strangers.
 */
export async function POST(req: Request) {
  try {
    const inviter = await requireUser();
    const parsed = schema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const { farmerId, poolId } = parsed.data;
    if (farmerId === inviter.id) {
      return NextResponse.json({ error: "That is you." }, { status: 400 });
    }

    const db = await getDb();

    const [membership] = await db
      .select({ id: poolMembers.id })
      .from(poolMembers)
      .where(
        and(eq(poolMembers.poolId, poolId), eq(poolMembers.farmerId, inviter.id)),
      )
      .limit(1);

    if (!membership) {
      return NextResponse.json(
        { error: "You can only invite people to a group you are in." },
        { status: 403 },
      );
    }

    const [pool] = await db
      .select({
        id: pools.id,
        status: pools.status,
        originLat: pools.originLat,
        originLng: pools.originLng,
        targetDepartAt: pools.targetDepartAt,
        mandiName: mandis.name,
        mandiNameHi: mandis.nameHi,
      })
      .from(pools)
      .innerJoin(mandis, eq(mandis.id, pools.mandiId))
      .where(eq(pools.id, poolId))
      .limit(1);

    if (!pool) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    if (pool.status !== "OPEN" && pool.status !== "READY") {
      return NextResponse.json(
        { error: "That group is no longer taking farmers." },
        { status: 400 },
      );
    }

    const [invitee] = await db
      .select({
        id: users.id,
        role: users.role,
        lat: users.lat,
        lng: users.lng,
        language: users.language,
      })
      .from(users)
      .where(eq(users.id, farmerId))
      .limit(1);

    if (!invitee || invitee.role !== "FARMER") {
      return NextResponse.json({ error: "Farmer not found" }, { status: 404 });
    }

    if (invitee.lat == null || invitee.lng == null) {
      return NextResponse.json(
        { error: "That farmer has not set a location yet." },
        { status: 400 },
      );
    }

    const distanceKm = roadDistanceKm(
      { lat: pool.originLat, lng: pool.originLng },
      { lat: invitee.lat, lng: invitee.lng },
    );

    if (distanceKm > REACH_KM) {
      return NextResponse.json(
        { error: "That farmer is too far from this group's route." },
        { status: 400 },
      );
    }

    // Already in it — say so plainly rather than sending a pointless message.
    const [already] = await db
      .select({ id: poolMembers.id })
      .from(poolMembers)
      .where(
        and(eq(poolMembers.poolId, poolId), eq(poolMembers.farmerId, farmerId)),
      )
      .limit(1);

    if (already) {
      return NextResponse.json({ ok: true, alreadyIn: true });
    }

    const totals = await db
      .select({ quantityKg: poolMembers.quantityKg })
      .from(poolMembers)
      .where(eq(poolMembers.poolId, poolId));
    const committedKg = totals.reduce((s, r) => s + r.quantityKg, 0);

    const depart = new Date(pool.targetDepartAt).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });

    await notify({
      userId: farmerId,
      type: "POOLING_ALERT",
      title: `${inviter.name} has invited you to share a truck`,
      body: `A group going to ${pool.mandiName} on ${depart} has ${weight(committedKg, "en")} so far. Join and the cost splits between all of you by weight.`,
      titleHi: `${inviter.name} ने आपको ट्रक साझा करने के लिए बुलाया है`,
      bodyHi: `${pool.mandiNameHi} जाने वाले समूह में अब तक ${weight(committedKg, "hi")} है, रवानगी ${depart}। जुड़िए — खर्च वज़न के हिसाब से सबमें बँटेगा।`,
      channel: "PUSH",
      href: `/farmer/pool/${poolId}`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Could not send that invitation." },
      { status: 400 },
    );
  }
}
