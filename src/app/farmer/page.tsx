import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  listings,
  crops,
  loads,
  trips,
  mandis,
  transactions,
  priceRecords,
} from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { findJoinablePools } from "@/lib/pools";
import { roadDistanceKm } from "@/lib/engine/geo";
import { preferPrice } from "@/lib/engine/sources";
import { LIVE_SOURCE } from "@/lib/pricefeed";
import { Page } from "@/components/Shell";
import { Slip, SlipHeading, Line } from "@/components/Slip";
import { Icon } from "@/components/Icon";
import { rupees, t, weight } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function FarmerHome() {
  const user = await currentUser();
  if (!user) redirect("/");
  if (user.role === "OPERATOR") redirect("/operator");

  const db = await getDb();
  const lang = user.language;
  const unread = await unreadCount(user.id);

  const openListings = await db
    .select({
      id: listings.id,
      quantityKg: listings.quantityKg,
      grade: listings.grade,
      dispatchBy: listings.dispatchBy,
      harvestedAt: listings.harvestedAt,
      cropId: crops.id,
      cropName: crops.name,
      cropNameHi: crops.nameHi,
      perishability: crops.perishability,
    })
    .from(listings)
    .innerJoin(crops, eq(crops.id, listings.cropId))
    .where(and(eq(listings.farmerId, user.id), eq(listings.status, "OPEN")))
    .orderBy(listings.dispatchBy);

  const activeLoads = await db
    .select({
      loadId: loads.id,
      quantityKg: loads.quantityKg,
      costShare: loads.costShare,
      loadStatus: loads.status,
      tripId: trips.id,
      tripStatus: trips.status,
      departAt: trips.departAt,
      mandiName: mandis.name,
      mandiNameHi: mandis.nameHi,
    })
    .from(loads)
    .innerJoin(trips, eq(trips.id, loads.tripId))
    .innerJoin(mandis, eq(mandis.id, trips.mandiId))
    .where(
      and(
        eq(loads.farmerId, user.id),
        inArray(loads.status, ["REQUESTED", "CONFIRMED", "PICKED_UP"]),
      ),
    )
    .orderBy(trips.departAt);

  const dues = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, user.id),
        eq(transactions.status, "DUE"),
        eq(transactions.kind, "TRANSPORT_CHARGE"),
      ),
    )
    .orderBy(desc(transactions.dueDate));

  const totalDue = dues.reduce((s, d) => s + d.amount, 0);

  /*
   * What a farmer actually opens this app at six in the morning to find out: is it
   * worth harvesting and sending anything today. The screen used to answer nothing —
   * a button, a link, and an empty list floating in most of a phone screen. These two
   * blocks are the answer, and both are live rather than decorative.
   */
  const origin = { lat: user.lat ?? 28.6092, lng: user.lng ?? 76.9798 };

  const priceRows = await db
    .select({
      cropId: priceRecords.cropId,
      cropName: crops.name,
      cropNameHi: crops.nameHi,
      mandiId: mandis.id,
      mandiName: mandis.name,
      mandiNameHi: mandis.nameHi,
      lat: mandis.lat,
      lng: mandis.lng,
      modalPrice: priceRecords.modalPrice,
      source: priceRecords.source,
      recordedAt: priceRecords.recordedAt,
    })
    .from(priceRecords)
    .innerJoin(crops, eq(crops.id, priceRecords.cropId))
    .innerJoin(mandis, eq(mandis.id, priceRecords.mandiId))
    .orderBy(desc(priceRecords.recordedAt));

  // Best believable price per (crop, mandi), then the best-paying mandi per crop
  // within reach — so the strip shows "onion is fetching most at X today", which is
  // the shape of the question rather than a table of everything.
  const bestByPair = new Map<string, (typeof priceRows)[number]>();
  for (const r of priceRows) {
    const key = `${r.cropId}|${r.mandiId}`;
    const held = bestByPair.get(key);
    if (!held || preferPrice(r, held)) bestByPair.set(key, r);
  }

  const topByCrop = new Map<
    string,
    (typeof priceRows)[number] & { distanceKm: number }
  >();
  for (const r of bestByPair.values()) {
    const distanceKm = roadDistanceKm(origin, { lat: r.lat, lng: r.lng });
    if (distanceKm > 150) continue;
    const held = topByCrop.get(r.cropId);
    if (!held || r.modalPrice > held.modalPrice) {
      topByCrop.set(r.cropId, { ...r, distanceKm });
    }
  }

  // Lead with what the government feed reported today; a live figure is worth more to
  // a farmer deciding this morning than a higher shipped estimate.
  const today = [...topByCrop.values()]
    .sort((a, b) => {
      const liveA = a.source === LIVE_SOURCE ? 1 : 0;
      const liveB = b.source === LIVE_SOURCE ? 1 : 0;
      return liveB - liveA || b.modalPrice - a.modalPrice;
    })
    .slice(0, 4);

  const groups = await findJoinablePools(origin);

  return (
    <Page user={user} lang={lang} active="home" unread={unread}>
      {/* The primary action gets the weight. Everything else on this screen is status. */}
      <Link
        href="/farmer/sell"
        role="button"
        className="mb-5 flex items-center justify-between gap-3 rounded-[3px] bg-[var(--color-keep)] px-5 py-4 text-[var(--color-paper-2)]"
      >
        <span className="min-w-0">
          <span className="block font-display text-[20px] font-700 uppercase tracking-[0.06em]">
            {t("sell", lang)}
          </span>
          <span className="block text-[13px] leading-snug opacity-85">
            {lang === "hi"
              ? "सबसे ज़्यादा देने वाली मंडी खोजें"
              : "Find the mandi that pays you most"}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-[26px] leading-none">
          →
        </span>
      </Link>

      {/*
        Today's prices. Four crops, each showing the mandi paying most for it within
        reach, live figures first. This is the block that turned the home screen from
        a menu into something worth opening.
      */}
      {today.length > 0 && (
        <section className="mb-5">
          <SlipHeading
            right={
              <Link href="/mandis" className="underline decoration-dotted underline-offset-2">
                {lang === "hi" ? "सब" : "All"}
              </Link>
            }
          >
            {lang === "hi" ? "आज के भाव, आपके पास" : "Today, near you"}
          </SlipHeading>

          <ul className="mt-1">
            {today.map((r, i) => (
              <li key={r.cropId}>
                <Link
                  href={`/farmer/sell?crop=${r.cropId}&qty=1000&grade=B&since=6&radius=150`}
                  className="print-in flex items-baseline justify-between gap-3 border-b border-dotted border-[var(--color-rule)] py-2.5"
                  style={{ "--i": i } as React.CSSProperties}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[16px]">
                      {lang === "hi" ? r.cropNameHi : r.cropName}
                      {r.source === LIVE_SOURCE && (
                        <span className="ml-1.5 rounded-[2px] bg-[var(--color-keep)] px-1 py-px align-[2px] text-[9.5px] font-600 uppercase tracking-wide text-[var(--color-paper-2)]">
                          {t("livePrice", lang)}
                        </span>
                      )}
                    </span>
                    <span className="tnum block truncate text-[12px] text-[var(--color-ink-3)]">
                      {lang === "hi" ? r.mandiNameHi : r.mandiName} ·{" "}
                      {r.distanceKm} km
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-right text-[17px] font-600">
                    {rupees(r.modalPrice)}
                    <span className="block text-[11px] font-400 text-[var(--color-ink-3)]">
                      {t("perQuintal", lang)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* A group forming nearby is time-sensitive, so it sits above status. */}
      {groups.length > 0 && (
        <Link href={`/farmer/pool/${groups[0].id}`} className="mb-5 block">
          <div className="flex items-center gap-3 rounded-[3px] border-2 border-[var(--color-pool)] bg-[var(--color-pool-soft)] px-4 py-3">
            <span className="shrink-0 text-[var(--color-pool)]">
              <Icon name="connect" size={26} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[11px] font-700 uppercase tracking-[0.16em] text-[var(--color-pool)]">
                {t("groupGathering", lang)}
              </span>
              <span className="block text-[14px] leading-snug">
                {lang === "hi"
                  ? `${groups[0].memberCount} किसान ${groups[0].mandiNameHi} जा रहे हैं — ${weight(groups[0].committedKg, lang)} तैयार`
                  : `${groups[0].memberCount} farmers heading to ${groups[0].mandiName} — ${weight(groups[0].committedKg, lang)} gathered`}
              </span>
            </span>
            <span aria-hidden className="shrink-0 text-[20px] text-[var(--color-pool)]">
              →
            </span>
          </div>
        </Link>
      )}

      {/*
        Earnings has no slot in the bottom bar, so it lives here — as the amount due
        when something is, and as a plain way in when nothing is. A farmer should
        never have to hunt for their own ledger.
      */}
      {/*
        A row, not a slip. This was a perforated card with an uppercase rubric and a
        2px rule carrying a single line of text — three devices to say "your ledger is
        this way". The slip is the app's signature and it should be spent on the
        screens where a farmer is reading money line by line, not on a link.
      */}
      <Link
        href="/farmer/earnings"
        className={`mb-5 flex items-center gap-3 rounded-[3px] border px-4 py-3 ${
          totalDue > 0
            ? "border-[var(--color-lose)] bg-[var(--color-lose-soft)]"
            : "border-[var(--color-rule-strong)] bg-[var(--color-paper-2)]"
        }`}
      >
        <span
          className={`shrink-0 ${
            totalDue > 0
              ? "text-[var(--color-lose)]"
              : "text-[var(--color-ink-3)]"
          }`}
        >
          <Icon name="ledger" size={24} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block font-display text-[11px] font-700 uppercase tracking-[0.16em] text-[var(--color-ink-3)]">
            {totalDue > 0 ? t("due", lang) : t("earnings", lang)}
          </span>
          <span className="block text-[14px] leading-snug">
            {totalDue > 0
              ? t("dueIn7Days", lang)
              : lang === "hi"
                ? "कमाई और पिछली बिक्री"
                : "Your income and past sales"}
          </span>
        </span>

        {totalDue > 0 ? (
          <span className="tnum shrink-0 text-[20px] font-600 text-[var(--color-lose)]">
            {rupees(totalDue)}
          </span>
        ) : (
          <span aria-hidden className="shrink-0 text-[20px] text-[var(--color-ink-3)]">
            →
          </span>
        )}
      </Link>

      {activeLoads.length > 0 && (
        <section className="mb-6">
          <SlipHeading>{t("myTrips", lang)}</SlipHeading>
          <ul className="mt-1">
            {activeLoads.map((l, i) => (
              <li key={l.loadId}>
                <Link
                  href={`/farmer/trip/${l.tripId}`}
                  className="print-in flex items-baseline justify-between gap-3 border-b border-dotted border-[var(--color-rule)] py-3"
                  style={{ "--i": i } as React.CSSProperties}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[16px] font-500">
                      {lang === "hi" ? l.mandiNameHi : l.mandiName}
                    </span>
                    <span className="tnum block text-[12.5px] text-[var(--color-ink-3)]">
                      {weight(l.quantityKg, lang)} ·{" "}
                      {new Date(l.departAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                  <StatusPill status={l.loadStatus} tripStatus={l.tripStatus} lang={lang} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SlipHeading right={`${openListings.length}`}>
          {lang === "hi" ? "तैयार उपज" : "Harvest ready to send"}
        </SlipHeading>

        {openListings.length === 0 ? (
          /*
            An empty screen is an invitation, not a notice. This used to read
            "Nothing listed yet. Start with Sell produce." — which points somewhere
            else and gives nothing to press.
          */
          <div className="mt-2 rounded-[3px] border border-dashed border-[var(--color-rule-strong)] px-4 py-5 text-center">
            <p className="text-[15px] leading-relaxed">
              {lang === "hi"
                ? "जो फ़सल भेजनी है उसे यहाँ दर्ज कीजिए। ऐप हर मंडी का हिसाब लगाकर बताएगा कि कहाँ भेजने पर सबसे ज़्यादा हाथ में आएगा।"
                : "Tell the app what you have ready and it will work out which mandi leaves you the most, after transport and spoilage."}
            </p>
            <Link
              href="/farmer/sell"
              role="button"
              className="mt-3 inline-flex items-center justify-center rounded-[3px] border-2 border-[var(--color-keep)] px-5 py-2.5 font-display text-[15px] font-700 uppercase tracking-[0.06em] text-[var(--color-keep)]"
            >
              {t("sell", lang)}
            </Link>
          </div>
        ) : (
          <div className="mt-1 space-y-3">
            {openListings.map((l, i) => {
              const hoursLeft = Math.round(
                (new Date(l.dispatchBy).getTime() - Date.now()) / 3_600_000,
              );
              const urgent = hoursLeft <= 24;
              const hoursSince = Math.max(
                0,
                Math.round(
                  (Date.now() - new Date(l.harvestedAt).getTime()) / 3_600_000,
                ),
              );

              return (
                <Slip key={l.id}>
                  <div
                    className="print-in"
                    style={{ "--i": i } as React.CSSProperties}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-[19px]">
                        {lang === "hi" ? l.cropNameHi : l.cropName}
                      </h3>
                      <span className="tnum text-[16px] font-600">
                        {weight(l.quantityKg, lang)}
                      </span>
                    </div>

                    <Line
                      label={t("harvestedWhen", lang)}
                      value={`${hoursSince} h ${lang === "hi" ? "पहले" : "ago"}`}
                    />
                    <Line
                      label={t("dispatchBy", lang)}
                      value={
                        hoursLeft > 0
                          ? `${hoursLeft} h`
                          : lang === "hi"
                            ? "समय बीत गया"
                            : "overdue"
                      }
                      tone={urgent ? "lose" : "neutral"}
                      strong={urgent}
                    />

                    <Link
                      href={`/farmer/sell?crop=${l.cropId}&qty=${l.quantityKg}&grade=${l.grade}&since=${hoursSince}&radius=250`}
                      role="button"
                      className="mt-3 flex items-center justify-center rounded-[3px] border-2 border-[var(--color-keep)] px-4 font-display text-[15px] font-700 uppercase tracking-[0.06em] text-[var(--color-keep)]"
                    >
                      {t("findBestMandi", lang)}
                    </Link>
                  </div>
                </Slip>
              );
            })}
          </div>
        )}
      </section>
    </Page>
  );
}

function StatusPill({
  status,
  tripStatus,
  lang,
}: {
  status: string;
  tripStatus: string;
  lang: "en" | "hi";
}) {
  const label =
    status === "REQUESTED"
      ? { en: "Waiting", hi: "इंतज़ार" }
      : tripStatus === "IN_TRANSIT"
        ? { en: "On the way", hi: "रास्ते में" }
        : tripStatus === "DELIVERED"
          ? { en: "Delivered", hi: "पहुँचा" }
          : { en: "Confirmed", hi: "पक्का" };

  const tone =
    status === "REQUESTED"
      ? "border-[var(--color-pool)] text-[var(--color-pool)]"
      : "border-[var(--color-keep)] text-[var(--color-keep)]";

  return (
    <span
      className={`shrink-0 rounded-[3px] border px-2 py-1 text-[12px] font-600 ${tone}`}
    >
      {label[lang]}
    </span>
  );
}
