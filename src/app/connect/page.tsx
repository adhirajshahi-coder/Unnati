import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  users,
  trucks,
  listings,
  crops,
  poolMembers,
  pools,
  mandis,
} from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { findJoinablePools } from "@/lib/pools";
import { roadDistanceKm } from "@/lib/engine/geo";
import { Page } from "@/components/Shell";
import { Slip, SlipHeading } from "@/components/Slip";
import { InviteButton } from "@/components/InviteButton";
import { rupees, weight } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/** Anyone further than this is not a plausible collaborator on one truck. */
const REACH_KM = 60;

/**
 * Who is near you, and what are they doing.
 *
 * Pooling only works if farmers can find each other. This is that directory: the
 * neighbours heading to the same mandi, and the truck owners close enough to make the
 * pickup run worth driving.
 *
 * Phone numbers are deliberately not here. An operator's number appears on a trip a
 * farmer has actually joined, because they need to reach their driver — but publishing
 * every farmer's number to everyone within 60 km is not a feature, it is a leak, and
 * PRD §8 limits this data to matching and logistics. Collaboration happens through an
 * invitation the other person can decline.
 */
export default async function ConnectPage() {
  const user = await currentUser();
  if (!user) redirect("/");

  const db = await getDb();
  const lang = user.language;
  const unread = await unreadCount(user.id);
  const origin = { lat: user.lat ?? 28.6092, lng: user.lng ?? 76.9798 };

  const people = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      village: users.village,
      district: users.district,
      lat: users.lat,
      lng: users.lng,
    })
    .from(users)
    .where(inArray(users.role, ["FARMER", "OPERATOR"]));

  const near = people
    .filter((p) => p.id !== user.id && p.lat != null && p.lng != null)
    .map((p) => ({
      ...p,
      distanceKm: roadDistanceKm(origin, { lat: p.lat!, lng: p.lng! }),
    }))
    .filter((p) => p.distanceKm <= REACH_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const nearbyFarmers = near.filter((p) => p.role === "FARMER");
  const nearbyOperators = near.filter((p) => p.role === "OPERATOR");

  // What those farmers have ready, so a neighbour can see whether a shared run makes
  // sense before inviting anyone.
  const openListings = nearbyFarmers.length
    ? await db
        .select({
          farmerId: listings.farmerId,
          quantityKg: listings.quantityKg,
          cropName: crops.name,
          cropNameHi: crops.nameHi,
        })
        .from(listings)
        .innerJoin(crops, eq(crops.id, listings.cropId))
        .where(
          and(
            eq(listings.status, "OPEN"),
            inArray(
              listings.farmerId,
              nearbyFarmers.map((f) => f.id),
            ),
          ),
        )
    : [];

  const listingsByFarmer = new Map<string, typeof openListings>();
  for (const l of openListings) {
    const held = listingsByFarmer.get(l.farmerId) ?? [];
    held.push(l);
    listingsByFarmer.set(l.farmerId, held);
  }

  const fleet = nearbyOperators.length
    ? await db
        .select({
          operatorId: trucks.operatorId,
          regNo: trucks.regNo,
          vehicleType: trucks.vehicleType,
          capacityKg: trucks.capacityKg,
          ratePerKm: trucks.ratePerKm,
          status: trucks.status,
          ratingSum: trucks.ratingSum,
          ratingCount: trucks.ratingCount,
        })
        .from(trucks)
        .where(
          inArray(
            trucks.operatorId,
            nearbyOperators.map((o) => o.id),
          ),
        )
    : [];

  const fleetByOperator = new Map<string, typeof fleet>();
  for (const tr of fleet) {
    const held = fleetByOperator.get(tr.operatorId) ?? [];
    held.push(tr);
    fleetByOperator.set(tr.operatorId, held);
  }

  // Groups already forming near this farmer, and the one they could invite people to.
  const groups = await findJoinablePools(origin);

  const myGroups = await db
    .select({
      poolId: pools.id,
      mandiName: mandis.name,
      mandiNameHi: mandis.nameHi,
      status: pools.status,
    })
    .from(poolMembers)
    .innerJoin(pools, eq(pools.id, poolMembers.poolId))
    .innerJoin(mandis, eq(mandis.id, pools.mandiId))
    .where(
      and(
        eq(poolMembers.farmerId, user.id),
        inArray(pools.status, ["OPEN", "READY"]),
      ),
    );

  const invitable = myGroups[0] ?? null;

  // Who is already in that group, so it is never offered to someone who has joined.
  const alreadyIn = invitable
    ? new Set(
        (
          await db
            .select({ farmerId: poolMembers.farmerId })
            .from(poolMembers)
            .where(eq(poolMembers.poolId, invitable.poolId))
        ).map((m) => m.farmerId),
      )
    : new Set<string>();

  /** "1 farmer", "2 farmers" — getting this wrong reads as a machine talking. */
  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;

  return (
    <Page user={user} lang={lang} active="connect" unread={unread}>
      <p className="mb-4 text-[14px] leading-relaxed text-[var(--color-ink-2)]">
        {lang === "hi"
          ? `आपके ${REACH_KM} किमी के दायरे में ${nearbyFarmers.length} किसान और ${nearbyOperators.length} ट्रक मालिक हैं। एक ही मंडी जाने वाले किसान मिलकर एक ट्रक साझा करें तो सबका खर्च घटता है।`
          : `${plural(nearbyFarmers.length, "farmer", "farmers")} and ${plural(nearbyOperators.length, "truck owner", "truck owners")} are within ${REACH_KM} km of you. Farmers heading to the same mandi can put one truck between them and all pay less.`}
      </p>

      {/* Routes first: this is the thing worth acting on, not a list of names. */}
      {groups.length > 0 && (
        <section className="mb-6">
          <SlipHeading right={`${groups.length}`}>
            {lang === "hi" ? "एक ही रास्ते पर" : "Going the same way"}
          </SlipHeading>
          <div className="mt-2 space-y-3">
            {groups.slice(0, 4).map((g) => (
              <Link key={g.id} href={`/farmer/pool/${g.id}`}>
                <Slip>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-[17px]">
                      {lang === "hi" ? g.mandiNameHi : g.mandiName}
                    </h3>
                    <span className="tnum shrink-0 text-[13px] font-600 text-[var(--color-pool)]">
                      {weight(g.committedKg, lang)}
                    </span>
                  </div>
                  <p className="tnum text-[12.5px] text-[var(--color-ink-3)]">
                    {g.memberCount} {lang === "hi" ? "किसान" : "farmers"} ·{" "}
                    {lang === "hi" ? "शुरू किया" : "started by"} {g.startedBy} ·{" "}
                    {g.originName}
                  </p>
                </Slip>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mb-6">
        <SlipHeading right={`${nearbyFarmers.length}`}>
          {lang === "hi" ? "आस-पास के किसान" : "Farmers near you"}
        </SlipHeading>

        {nearbyFarmers.length === 0 ? (
          <p className="py-6 text-center text-[15px] text-[var(--color-ink-3)]">
            {lang === "hi"
              ? "अभी आपके पास कोई और किसान दर्ज नहीं है।"
              : "No other farmers are registered near you yet."}
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {nearbyFarmers.map((f) => {
              const has = listingsByFarmer.get(f.id) ?? [];
              return (
                <Slip key={f.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-[17px]">{f.name}</h3>
                    <span className="tnum shrink-0 text-[13px] text-[var(--color-ink-2)]">
                      {f.distanceKm} km
                    </span>
                  </div>
                  <p className="text-[12.5px] text-[var(--color-ink-3)]">
                    {[f.village, f.district].filter(Boolean).join(", ")}
                  </p>

                  {has.length > 0 && (
                    <p className="mt-1.5 text-[13.5px] text-[var(--color-ink-2)]">
                      {lang === "hi" ? "तैयार: " : "Ready to send: "}
                      {has
                        .map(
                          (l) =>
                            `${lang === "hi" ? l.cropNameHi : l.cropName} ${weight(l.quantityKg, lang)}`,
                        )
                        .join(", ")}
                    </p>
                  )}

                  {invitable &&
                    user.role === "FARMER" &&
                    !alreadyIn.has(f.id) && (
                      <InviteButton
                        farmerId={f.id}
                        farmerName={f.name}
                        poolId={invitable.poolId}
                        mandiName={
                          lang === "hi"
                            ? invitable.mandiNameHi
                            : invitable.mandiName
                        }
                        lang={lang}
                      />
                    )}

                  {invitable && alreadyIn.has(f.id) && (
                    <p className="mt-2 text-[13px] text-[var(--color-keep)]">
                      {lang === "hi"
                        ? "आपके समूह में पहले से हैं"
                        : "Already in your group"}
                    </p>
                  )}
                </Slip>
              );
            })}
          </div>
        )}

        {user.role === "FARMER" && !invitable && nearbyFarmers.length > 0 && (
          <p className="mt-2 text-[12.5px] leading-snug text-[var(--color-ink-3)]">
            {lang === "hi"
              ? "किसी को बुलाने के लिए पहले अपना समूह शुरू करें — “उपज बेचें” में फ़सल चुनकर “ट्रक साझा करें” दबाइए।"
              : "Start a group first and you can invite them into it — pick a crop under “Sell produce” and choose “Share a truck”."}
          </p>
        )}
      </section>

      <section>
        <SlipHeading right={`${nearbyOperators.length}`}>
          {lang === "hi" ? "आस-पास के ट्रक मालिक" : "Truck owners near you"}
        </SlipHeading>

        {nearbyOperators.length === 0 ? (
          <p className="py-6 text-center text-[15px] text-[var(--color-ink-3)]">
            {lang === "hi"
              ? "अभी आपके इलाके में कोई ट्रक मालिक दर्ज नहीं है।"
              : "No truck owners are registered in your area yet."}
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {nearbyOperators.map((o) => {
              const theirs = fleetByOperator.get(o.id) ?? [];
              const available = theirs.filter((tr) => tr.status === "AVAILABLE");

              return (
                <Slip key={o.id}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-[17px]">{o.name}</h3>
                    <span className="tnum shrink-0 text-[13px] text-[var(--color-ink-2)]">
                      {o.distanceKm} km
                    </span>
                  </div>
                  <p className="text-[12.5px] text-[var(--color-ink-3)]">
                    {[o.village, o.district].filter(Boolean).join(", ")} ·{" "}
                    {available.length}/{theirs.length}{" "}
                    {lang === "hi" ? "ट्रक खाली" : "trucks free"}
                  </p>

                  {theirs.length > 0 && (
                    <ul className="mt-2">
                      {theirs.map((tr) => {
                        const rating =
                          tr.ratingCount > 0
                            ? (tr.ratingSum / tr.ratingCount).toFixed(1)
                            : null;
                        return (
                          <li
                            key={tr.regNo}
                            className="flex items-baseline justify-between gap-3 border-b border-dotted border-[var(--color-rule)] py-1.5 last:border-0"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-[14px]">
                                {tr.vehicleType}
                                {rating ? ` · ★ ${rating}` : ""}
                              </span>
                              <span className="tnum block text-[11.5px] text-[var(--color-ink-3)]">
                                {tr.regNo} · {weight(tr.capacityKg, lang)}
                              </span>
                            </span>
                            <span className="tnum shrink-0 text-[13.5px]">
                              {rupees(tr.ratePerKm)}/km
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Slip>
              );
            })}
          </div>
        )}
      </section>

      <p className="mt-4 text-[12px] leading-snug text-[var(--color-ink-3)]">
        {lang === "hi"
          ? "फ़ोन नंबर यहाँ नहीं दिखाए जाते। जिस यात्रा में आप शामिल होते हैं, उसी के पन्ने पर ट्रक मालिक का नंबर मिलता है। बाकी बातचीत ऐप के न्योते से होती है, जिसे सामने वाला मना भी कर सकता है।"
          : "Phone numbers are not listed here. You get the truck owner’s number on a trip you have joined; everything else happens through an invitation the other person can decline."}
      </p>

      <p className="mt-3 text-center">
        <Link
          href="/help"
          className="text-[14px] underline decoration-dotted underline-offset-2 text-[var(--color-keep)]"
        >
          {lang === "hi" ? "कोई सवाल? तुरंत मदद लें" : "Questions? Get instant help"}
        </Link>
      </p>
    </Page>
  );
}
