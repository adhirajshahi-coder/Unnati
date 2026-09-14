import { redirect, notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { trips, trucks, mandis, users, crops, loads, listings } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { DEFAULT_RATE_PER_KM } from "@/lib/booking";
import { detourKm } from "@/lib/engine/geo";
import { pooledQuote } from "@/lib/engine/pooling";
import { soloCost, savings } from "@/lib/engine/costs";
import { Page } from "@/components/Shell";
import { Slip, SlipHeading, Line, Stamp } from "@/components/Slip";
import { JoinButton } from "@/components/JoinButton";
import { rupees, t, weight } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * The pooling offer.
 *
 * A farmer arrives here from a recommendation or a "truck going your way" alert, and
 * has one question: what will this cost me, and is it better than going alone? The
 * page answers that before anything else, and shows who else is on the truck — pooling
 * is a social decision as much as a financial one.
 */
export default async function JoinTripPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await currentUser();
  if (!user) redirect("/");

  const { tripId } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const lang = user.language;
  const unread = await unreadCount(user.id);

  const [trip] = await db
    .select({
      id: trips.id,
      departAt: trips.departAt,
      capacityKg: trips.capacityKg,
      usedKg: trips.usedKg,
      totalCost: trips.totalCost,
      baseDistanceKm: trips.baseDistanceKm,
      status: trips.status,
      originName: trips.originName,
      originLat: trips.originLat,
      originLng: trips.originLng,
      mandiId: mandis.id,
      mandiName: mandis.name,
      mandiNameHi: mandis.nameHi,
      mandiLat: mandis.lat,
      mandiLng: mandis.lng,
      regNo: trucks.regNo,
      vehicleType: trucks.vehicleType,
      ratePerKm: trucks.ratePerKm,
      ratingSum: trucks.ratingSum,
      ratingCount: trucks.ratingCount,
      operatorName: users.name,
    })
    .from(trips)
    .innerJoin(trucks, eq(trucks.id, trips.truckId))
    .innerJoin(users, eq(users.id, trucks.operatorId))
    .innerJoin(mandis, eq(mandis.id, trips.mandiId))
    .where(eq(trips.id, tripId))
    .limit(1);

  if (!trip) notFound();

  const spaceKg = trip.capacityKg - trip.usedKg;
  const quantityKg = Math.min(
    spaceKg,
    Number(sp.qty ?? 0) > 0 ? Number(sp.qty) : Math.min(spaceKg, 2000),
  );

  const origin = { lat: user.lat ?? 20.0806, lng: user.lng ?? 74.1103 };
  const detour = detourKm(
    { lat: trip.originLat, lng: trip.originLng },
    origin,
    { lat: trip.mandiLat, lng: trip.mandiLng },
  );

  const quote = pooledQuote(
    quantityKg,
    trip.capacityKg,
    trip.totalCost,
    detour,
    trip.ratePerKm,
  );

  const solo = soloCost(trip.baseDistanceKm + detour, DEFAULT_RATE_PER_KM);
  const saved = savings(solo, quote);

  const aboard = await db
    .select({
      id: loads.id,
      farmerName: users.name,
      quantityKg: loads.quantityKg,
      costShare: loads.costShare,
      pickupName: loads.pickupName,
      cropName: crops.name,
      cropNameHi: crops.nameHi,
    })
    .from(loads)
    .innerJoin(users, eq(users.id, loads.farmerId))
    .innerJoin(crops, eq(crops.id, loads.cropId))
    .where(and(eq(loads.tripId, tripId), eq(loads.status, "CONFIRMED")));

  const myOpenListings = await db
    .select({
      id: listings.id,
      cropId: listings.cropId,
      quantityKg: listings.quantityKg,
      grade: listings.grade,
      pickupName: listings.pickupName,
      pickupLat: listings.pickupLat,
      pickupLng: listings.pickupLng,
      cropName: crops.name,
      cropNameHi: crops.nameHi,
    })
    .from(listings)
    .innerJoin(crops, eq(crops.id, listings.cropId))
    .where(and(eq(listings.farmerId, user.id), eq(listings.status, "OPEN")));

  const cropList = await db.select().from(crops).orderBy(crops.name);
  const rating =
    trip.ratingCount > 0 ? (trip.ratingSum / trip.ratingCount).toFixed(1) : null;

  return (
    <Page user={user} lang={lang} active="sell" unread={unread}>
      <Slip lifted className="mb-5">
        <div className="mb-3">
          <div className="font-display text-[11px] font-700 uppercase tracking-[0.18em] text-[var(--color-pool)]">
            {t("poolingAvailable", lang)}
          </div>
          <h1 className="text-[26px] leading-tight">
            {lang === "hi" ? trip.mandiNameHi : trip.mandiName}
          </h1>
          <div className="tnum text-[12.5px] text-[var(--color-ink-3)]">
            {trip.originName} → {trip.baseDistanceKm} km ·{" "}
            {new Date(trip.departAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            })}
          </div>
        </div>

        <div className="border-t-2 border-[var(--color-ink)] pt-1">
          <Line
            index={0}
            label={trip.vehicleType}
            sub={`${trip.regNo} · ${trip.operatorName}${rating ? ` · ★ ${rating}` : ""}`}
            value={weight(trip.capacityKg, lang)}
          />
          <Line
            index={1}
            label={t("spaceLeft", lang)}
            value={weight(spaceKg, lang)}
            tone="pool"
            strong
          />
          <Line
            index={2}
            label={lang === "hi" ? "आपकी मात्रा" : "Your load"}
            value={weight(quantityKg, lang)}
          />
          <Line
            index={3}
            label={lang === "hi" ? "आपके लिए चक्कर" : "Detour to collect you"}
            sub={
              detour === 0
                ? lang === "hi"
                  ? "रास्ते में ही है — कोई अतिरिक्त खर्च नहीं"
                  : "You are on the route — no extra charge"
                : lang === "hi"
                  ? "यह खर्च सिर्फ़ आपका है"
                  : "Charged to you alone, not split"
            }
            value={`${detour} km`}
            tone={detour === 0 ? "keep" : "lose"}
          />
        </div>

        {/* Fill bar: the operator's KPI and the farmer's reassurance in one object. */}
        <div className="mt-4">
          <div className="mb-1 flex items-baseline justify-between text-[12px] text-[var(--color-ink-2)]">
            <span>{t("fillRate", lang)}</span>
            <span className="tnum">
              {Math.round(((trip.usedKg + quantityKg) / trip.capacityKg) * 100)}%
            </span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-[2px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)]">
            <div
              className="bg-[var(--color-keep)]"
              style={{ width: `${(trip.usedKg / trip.capacityKg) * 100}%` }}
            />
            <div
              className="bg-[var(--color-pool)]"
              style={{ width: `${(quantityKg / trip.capacityKg) * 100}%` }}
            />
          </div>
          <div className="mt-1 flex gap-3 text-[11.5px] text-[var(--color-ink-3)]">
            <span>
              <span className="mr-1 inline-block h-2 w-2 bg-[var(--color-keep)]" />
              {lang === "hi" ? "पहले से भरा" : "Already booked"}
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 bg-[var(--color-pool)]" />
              {lang === "hi" ? "आपका हिस्सा" : "Your load"}
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
          <Stamp label={t("yourShare", lang)} value={rupees(quote)} tone="lose" />
          {saved.saved > 0 && (
            <div className="text-right">
              <div className="tnum text-[18px] font-600 text-[var(--color-keep)]">
                {t("youSave", lang)} {rupees(saved.saved)}
              </div>
              <div className="text-[12px] text-[var(--color-ink-3)]">
                {lang === "hi"
                  ? `पूरा ट्रक लेने पर ${rupees(solo)} लगता`
                  : `Hiring the whole truck would cost ${rupees(solo)}`}
              </div>
            </div>
          )}
        </div>
      </Slip>

      {aboard.length > 0 && (
        <section className="mb-5">
          <SlipHeading right={`${aboard.length} ${t("farmersSharing", lang)}`}>
            {t("costSplit", lang)}
          </SlipHeading>
          <ul className="mt-1">
            {aboard.map((a) => (
              <li
                key={a.id}
                className="flex items-baseline justify-between gap-3 border-b border-dotted border-[var(--color-rule)] py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px]">{a.farmerName}</span>
                  <span className="tnum block text-[12px] text-[var(--color-ink-3)]">
                    {lang === "hi" ? a.cropNameHi : a.cropName} ·{" "}
                    {weight(a.quantityKg, lang)} · {a.pickupName}
                  </span>
                </span>
                <span className="tnum shrink-0 text-[15px]">
                  {rupees(a.costShare)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] leading-snug text-[var(--color-ink-3)]">
            {lang === "hi"
              ? "खर्च वज़न के हिसाब से बँटता है। किसी के लिए किया गया अतिरिक्त चक्कर उसी के खाते में जाता है।"
              : "The shared leg splits by weight. A detour made for one farmer is charged to that farmer, not to everyone."}
          </p>
        </section>
      )}

      <JoinButton
        tripId={trip.id}
        lang={lang}
        disabled={trip.status !== "OPEN" || spaceKg <= 0}
        defaultQuantityKg={quantityKg}
        maxKg={spaceKg}
        listings={myOpenListings.map((l) => ({
          id: l.id,
          cropId: l.cropId,
          label: `${lang === "hi" ? l.cropNameHi : l.cropName} · ${weight(l.quantityKg, lang)}`,
          quantityKg: l.quantityKg,
          grade: l.grade,
          pickupName: l.pickupName,
          pickupLat: l.pickupLat,
          pickupLng: l.pickupLng,
        }))}
        crops={cropList.map((c) => ({
          id: c.id,
          label: lang === "hi" ? c.nameHi : c.name,
        }))}
        fallbackPickup={{
          name: user.village ?? "Farm",
          lat: origin.lat,
          lng: origin.lng,
        }}
      />
    </Page>
  );
}
