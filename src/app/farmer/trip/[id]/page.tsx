import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  trips,
  trucks,
  mandis,
  users,
  crops,
  loads,
  trackingPings,
} from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { loadingSequence } from "@/lib/engine/pooling";
import { roadDistanceKm } from "@/lib/engine/geo";
import { Page } from "@/components/Shell";
import { Slip, SlipHeading, Line } from "@/components/Slip";
import { RouteMap } from "@/components/RouteMap";
import { prefersHindi, rupees, t, weight, type Lang, type MessageKey } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/** Live view of a booking: where the truck is, who is on it, what each farmer owes. */
export default async function TripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/");

  const { id } = await params;
  const db = await getDb();
  const lang = user.language;
  const unread = await unreadCount(user.id);

  const [trip] = await db
    .select({
      id: trips.id,
      status: trips.status,
      departAt: trips.departAt,
      capacityKg: trips.capacityKg,
      usedKg: trips.usedKg,
      totalCost: trips.totalCost,
      baseDistanceKm: trips.baseDistanceKm,
      originName: trips.originName,
      originLat: trips.originLat,
      originLng: trips.originLng,
      mandiName: mandis.name,
      mandiNameHi: mandis.nameHi,
      mandiLat: mandis.lat,
      mandiLng: mandis.lng,
      regNo: trucks.regNo,
      vehicleType: trucks.vehicleType,
      operatorName: users.name,
      operatorPhone: users.phone,
    })
    .from(trips)
    .innerJoin(trucks, eq(trucks.id, trips.truckId))
    .innerJoin(users, eq(users.id, trucks.operatorId))
    .innerJoin(mandis, eq(mandis.id, trips.mandiId))
    .where(eq(trips.id, id))
    .limit(1);

  if (!trip) notFound();

  const allLoads = await db
    .select({
      id: loads.id,
      farmerId: loads.farmerId,
      farmerName: users.name,
      quantityKg: loads.quantityKg,
      costShare: loads.costShare,
      status: loads.status,
      pickupName: loads.pickupName,
      pickupLat: loads.pickupLat,
      pickupLng: loads.pickupLng,
      detourKm: loads.detourKm,
      cropName: crops.name,
      cropNameHi: crops.nameHi,
      salePricePerQuintal: loads.salePricePerQuintal,
    })
    .from(loads)
    .innerJoin(users, eq(users.id, loads.farmerId))
    .innerJoin(crops, eq(crops.id, loads.cropId))
    .where(
      and(
        eq(loads.tripId, id),
        inArray(loads.status, [
          "REQUESTED",
          "CONFIRMED",
          "PICKED_UP",
          "DELIVERED",
        ]),
      ),
    )
    .orderBy(loads.createdAt);

  const mine = allLoads.find((l) => l.farmerId === user.id);

  const [lastPing] = await db
    .select()
    .from(trackingPings)
    .where(eq(trackingPings.tripId, id))
    .orderBy(desc(trackingPings.at))
    .limit(1);

  const sequence = loadingSequence(
    allLoads
      .filter((l) => l.status !== "REJECTED" && l.status !== "CANCELLED")
      .map((l) => ({
        id: l.id,
        pickupLat: l.pickupLat,
        pickupLng: l.pickupLng,
        cropName: prefersHindi(lang) ? l.cropNameHi : l.cropName,
      })),
    {
      origin: { lat: trip.originLat, lng: trip.originLng },
      destination: { lat: trip.mandiLat, lng: trip.mandiLng },
      capacityKg: trip.capacityKg,
      usedKg: trip.usedKg,
      totalCost: trip.totalCost,
      ratePerKm: 0,
      departAt: trip.departAt,
    },
  );

  // Progress along the route, from the last ping. Straight-line proportion is honest
  // enough for a "how far along" bar and needs no routing service.
  const travelled = lastPing
    ? roadDistanceKm(
        { lat: trip.originLat, lng: trip.originLng },
        { lat: lastPing.lat, lng: lastPing.lng },
      )
    : 0;
  const progress =
    trip.status === "DELIVERED"
      ? 100
      : Math.min(100, Math.round((travelled / trip.baseDistanceKm) * 100));

  return (
    <Page user={user} lang={lang} active="trips" unread={unread}>
      <Slip lifted className="mb-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display text-[11px] font-700 uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
              {trip.originName} →
            </div>
            <h1 className="text-[26px] leading-tight">
              {prefersHindi(lang) ? trip.mandiNameHi : trip.mandiName}
            </h1>
            <div className="tnum text-[12.5px] text-[var(--color-ink-3)]">
              {trip.vehicleType} · {trip.regNo}
            </div>
          </div>
          <TripStatus status={trip.status} lang={lang} />
        </div>

        <RouteMap
          origin={{ lat: trip.originLat, lng: trip.originLng, label: trip.originName }}
          destination={{
            lat: trip.mandiLat,
            lng: trip.mandiLng,
            label: prefersHindi(lang) ? trip.mandiNameHi : trip.mandiName,
          }}
          stops={allLoads
            .filter((l) => l.status !== "REQUESTED")
            .map((l) => ({
              lat: l.pickupLat,
              lng: l.pickupLng,
              label: l.pickupName,
              mine: l.farmerId === user.id,
            }))}
          current={lastPing ? { lat: lastPing.lat, lng: lastPing.lng } : null}
          progress={progress}
          lang={lang}
        />

        <div className="mt-3 border-t border-dotted border-[var(--color-rule)] pt-1">
          <Line
            label={t("departs", lang)}
            value={new Date(trip.departAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            })}
          />
          <Line
            label={t("distance", lang)}
            value={`${trip.baseDistanceKm} km`}
          />
          {lastPing && (
            <Line
              label={t("lastSeen", lang)}
              sub={`${Math.round(travelled)} km ${t("covered", lang)}`}
              value={timeAgo(new Date(lastPing.at), lang)}
            />
          )}
          <Line
            label={t("operator", lang)}
            sub={trip.operatorName}
            value={
              <a
                href={`tel:${trip.operatorPhone}`}
                className="underline decoration-dotted underline-offset-2"
              >
                {trip.operatorPhone}
              </a>
            }
          />
        </div>

        {mine && (
          <div className="mt-4 rounded-[3px] bg-[var(--color-keep-soft)] px-3 py-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[14px] text-[var(--color-keep)]">
                {t("yourShare", lang)} · {weight(mine.quantityKg, lang)}
              </span>
              {/*
                A requested load has no share yet — it is only priced once the operator
                accepts and the split is recomputed. Printing ₹0 here would read as
                "free", which is the opposite of true.
              */}
              <span className="tnum text-[22px] font-600 text-[var(--color-keep)]">
                {mine.status === "REQUESTED"
                  ? prefersHindi(lang)
                    ? "मंज़ूरी बाकी"
                    : "awaiting approval"
                  : rupees(mine.costShare)}
              </span>
            </div>
            {mine.detourKm > 0 && (
              <p className="tnum mt-1 text-[12px] text-[var(--color-ink-2)]">
                {prefersHindi(lang)
                  ? `इसमें आपके लिए ${mine.detourKm} किमी अतिरिक्त चक्कर का खर्च शामिल है।`
                  : `Includes the ${mine.detourKm} km detour made to collect from you.`}
              </p>
            )}
          </div>
        )}
      </Slip>

      <section className="mb-5">
        <SlipHeading right={`${rupees(trip.totalCost)} ${prefersHindi(lang) ? "कुल" : "total"}`}>
          {t("costSplit", lang)}
        </SlipHeading>
        <ul className="mt-1">
          {allLoads.map((l) => (
            <li
              key={l.id}
              className={`flex items-baseline justify-between gap-3 border-b border-dotted border-[var(--color-rule)] py-2.5 ${
                l.farmerId === user.id ? "font-600" : ""
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px]">
                  {l.farmerName}
                  {l.farmerId === user.id && (
                    <span className="ml-1 text-[12px] text-[var(--color-keep)]">
                      ({prefersHindi(lang) ? "आप" : "you"})
                    </span>
                  )}
                </span>
                <span className="tnum block text-[12px] text-[var(--color-ink-3)]">
                  {prefersHindi(lang) ? l.cropNameHi : l.cropName} ·{" "}
                  {weight(l.quantityKg, lang)} · {l.pickupName}
                </span>
              </span>
              <span className="tnum shrink-0 text-[15px]">
                {l.status === "REQUESTED"
                  ? prefersHindi(lang)
                    ? "इंतज़ार"
                    : "pending"
                  : rupees(l.costShare)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {sequence.length > 1 && (
        <section className="mb-5">
          <SlipHeading>{t("pickupOrder", lang)}</SlipHeading>
          <ol className="mt-1">
            {sequence.map((s) => {
              const load = allLoads.find((l) => l.id === s.id);
              return (
                <li
                  key={s.id}
                  className="flex items-baseline gap-3 border-b border-dotted border-[var(--color-rule)] py-2"
                >
                  <span className="tnum w-5 shrink-0 text-[13px] font-600 text-[var(--color-pool)]">
                    {s.order}
                  </span>
                  <span className="flex-1 text-[15px]">{load?.pickupName}</span>
                  <span className="tnum text-[12.5px] text-[var(--color-ink-3)]">
                    {s.cropName}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-[12px] leading-snug text-[var(--color-ink-3)]">
            {prefersHindi(lang)
              ? "पहले उठाई गई उपज सबसे अंदर जाती है। अपनी उपज इस समय तक तैयार रखें।"
              : "Produce collected first is loaded deepest. Have yours ready when the truck reaches you."}
          </p>
        </section>
      )}

      <Link
        href="/farmer/trips"
        className="block text-center text-[14px] underline decoration-dotted underline-offset-2 text-[var(--color-ink-2)]"
      >
        {t("back", lang)}
      </Link>
    </Page>
  );
}

function TripStatus({ status, lang }: { status: string; lang: Lang }) {
  const map: Record<string, { key: MessageKey; tone: string }> = {
    OPEN: { key: "acceptingLoads", tone: "pool" },
    FULL: { key: "truckFull", tone: "pool" },
    IN_TRANSIT: { key: "onTheWay", tone: "keep" },
    DELIVERED: { key: "delivered", tone: "keep" },
    CANCELLED: { key: "cancelled", tone: "lose" },
  };
  const s = map[status] ?? map.OPEN;
  const tone = {
    keep: "border-[var(--color-keep)] text-[var(--color-keep)]",
    pool: "border-[var(--color-pool)] text-[var(--color-pool)]",
    lose: "border-[var(--color-lose)] text-[var(--color-lose)]",
  }[s.tone]!;

  return (
    <span
      className={`shrink-0 rounded-[3px] border px-2 py-1 text-[12.5px] font-600 ${tone}`}
    >
      {t(s.key, lang)}
    </span>
  );
}

function timeAgo(d: Date, lang: Lang) {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return t("justNow", lang);
  if (mins < 60) return `${mins} ${prefersHindi(lang) ? "मिनट पहले" : "min ago"}`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} ${prefersHindi(lang) ? "घंटे पहले" : "h ago"}`;
  return `${Math.round(h / 24)} ${prefersHindi(lang) ? "दिन पहले" : "d ago"}`;
}
