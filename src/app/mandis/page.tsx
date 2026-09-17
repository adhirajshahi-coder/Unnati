import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { mandis, crops, priceRecords } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { roadDistanceKm } from "@/lib/engine/geo";
import { LIVE_SOURCE } from "@/lib/pricefeed";
import { preferPrice } from "@/lib/engine/sources";
import { Page } from "@/components/Shell";
import { Slip, SlipHeading } from "@/components/Slip";
import { LocationPicker } from "@/components/LocationPicker";
import { DEFAULT_LOCATIONS } from "@/data/mandis";
import { prefersHindi, rupees, t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Nearby mandis and what they are paying today.
 *
 * This is the browsing view, distinct from the sell flow: no quantity, no ranking by
 * net price, just "what is around me and what is it quoting". A farmer checks this
 * over morning tea before deciding whether there is anything worth harvesting for.
 *
 * Distance comes from this app's own mandi coordinates; the prices come from the
 * government feed where it reported today, and from the shipped baseline where it did
 * not. Which one you are looking at is labelled on every row, because a farmer
 * planning around a number deserves to know how much it is worth.
 */
export default async function MandisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await currentUser();
  if (!user) redirect("/");

  const sp = await searchParams;
  const db = await getDb();
  const lang = user.language;
  const unread = await unreadCount(user.id);

  const origin = { lat: user.lat ?? 28.6092, lng: user.lng ?? 76.9798 };
  const radiusKm = Number(sp.radius ?? 150);
  const cropId = sp.crop ?? "";

  const cropList = await db
    .select({
      id: crops.id,
      name: crops.name,
      nameHi: crops.nameHi,
    })
    .from(crops)
    .orderBy(crops.name);

  const allMandis = await db.select().from(mandis);

  // Best price per (mandi, crop) — see preferPrice: a live government figure beats
  // the shipped baseline even when the baseline carries a later timestamp. One pass
  // rather than a query per mandi; the table is a few thousand rows.
  const priceRows = await db
    .select({
      mandiId: priceRecords.mandiId,
      cropId: priceRecords.cropId,
      cropName: crops.name,
      cropNameHi: crops.nameHi,
      modalPrice: priceRecords.modalPrice,
      minPrice: priceRecords.minPrice,
      maxPrice: priceRecords.maxPrice,
      source: priceRecords.source,
      recordedAt: priceRecords.recordedAt,
    })
    .from(priceRecords)
    .innerJoin(crops, eq(crops.id, priceRecords.cropId))
    .orderBy(desc(priceRecords.recordedAt));

  const newest = new Map<string, (typeof priceRows)[number]>();
  for (const r of priceRows) {
    const key = `${r.mandiId}|${r.cropId}`;
    const held = newest.get(key);
    if (!held || preferPrice(r, held)) newest.set(key, r);
  }

  const nearby = allMandis
    .map((m) => {
      const distanceKm = roadDistanceKm(origin, { lat: m.lat, lng: m.lng });
      const prices = [...newest.values()].filter((p) => p.mandiId === m.id);
      const live = prices.filter((p) => p.source === LIVE_SOURCE);

      return {
        mandi: m,
        distanceKm,
        prices: (cropId ? prices.filter((p) => p.cropId === cropId) : prices)
          .sort((a, b) => a.cropName.localeCompare(b.cropName))
          .slice(0, cropId ? 1 : 6),
        totalPrices: prices.length,
        liveCount: live.length,
      };
    })
    .filter((m) => m.distanceKm <= radiusKm)
    .filter((m) => (cropId ? m.prices.length > 0 : true))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const liveTotal = nearby.reduce((s, m) => s + m.liveCount, 0);

  return (
    <Page user={user} lang={lang} active="mandis" unread={unread}>
      <LocationPicker
        lang={lang}
        current={{
          village: user.village,
          district: user.district,
          state: user.state,
        }}
        options={DEFAULT_LOCATIONS}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form method="get" className="flex flex-1 flex-wrap gap-2">
          <select
            name="crop"
            defaultValue={cropId}
            className="min-w-0 flex-1 rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-2 text-[15px]"
          >
            <option value="">{t("allCrops", lang)}</option>
            {cropList.map((c) => (
              <option key={c.id} value={c.id}>
                {prefersHindi(lang) ? c.nameHi : c.name}
              </option>
            ))}
          </select>
          <select
            name="radius"
            defaultValue={String(radiusKm)}
            className="rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-2 text-[15px]"
          >
            {[50, 100, 150, 250, 400].map((r) => (
              <option key={r} value={r}>
                {r} km
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-[3px] bg-[var(--color-keep)] px-4 font-display text-[14px] font-700 uppercase tracking-[0.06em] text-[var(--color-paper-2)]"
          >
            {prefersHindi(lang) ? "दिखाएँ" : "Show"}
          </button>
        </form>
      </div>

      <SlipHeading
        right={`${nearby.length} · ${liveTotal} ${t("livePrice", lang).toLowerCase()}`}
      >
        {t("nearbyMandis", lang)}
      </SlipHeading>

      {nearby.length === 0 ? (
        <p className="py-10 text-center text-[15px] text-[var(--color-ink-3)]">
          {prefersHindi(lang)
            ? "इस दूरी में कोई मंडी नहीं मिली। दूरी बढ़ाकर देखें।"
            : "No mandi within this distance. Try a wider radius."}
        </p>
      ) : (
        <div className="mt-2 space-y-3">
          {nearby.map((row, i) => (
            <Slip key={row.mandi.id}>
              <div
                className="print-in"
                style={{ "--i": i } as React.CSSProperties}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-[18px] leading-tight">
                    {prefersHindi(lang) ? row.mandi.nameHi : row.mandi.name}
                  </h3>
                  <span className="tnum shrink-0 text-[13px] text-[var(--color-ink-2)]">
                    {row.distanceKm} km
                  </span>
                </div>
                <p className="text-[12px] text-[var(--color-ink-3)]">
                  {row.mandi.district}, {row.mandi.state} · {row.mandi.region}
                  {" · "}
                  {prefersHindi(lang) ? "आढ़त" : "commission"}{" "}
                  {Math.round(row.mandi.commissionRate * 100)}%
                </p>

                {row.prices.length === 0 ? (
                  <p className="mt-2 text-[13.5px] text-[var(--color-ink-3)]">
                    {t("noPriceToday", lang)}
                  </p>
                ) : (
                  <ul className="mt-2">
                    {row.prices.map((p) => {
                      const isLive = p.source === LIVE_SOURCE;
                      const ageH = Math.round(
                        (Date.now() - new Date(p.recordedAt).getTime()) /
                          3_600_000,
                      );
                      return (
                        <li
                          key={p.cropId}
                          className="flex items-baseline justify-between gap-2 border-b border-dotted border-[var(--color-rule)] py-1.5 last:border-0"
                        >
                          <span className="min-w-0 truncate text-[14px]">
                            {prefersHindi(lang) ? p.cropNameHi : p.cropName}
                            {isLive && (
                              <span className="ml-1.5 rounded-[2px] bg-[var(--color-keep)] px-1 py-px text-[10px] font-600 uppercase tracking-wide text-[var(--color-paper-2)]">
                                {t("livePrice", lang)}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="tnum block text-[15px] font-600">
                              {rupees(p.modalPrice)}
                            </span>
                            <span className="tnum block text-[10.5px] text-[var(--color-ink-3)]">
                              {rupees(p.minPrice, false)}–
                              {rupees(p.maxPrice, false)} · {ageH}h
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {!cropId && row.totalPrices > row.prices.length && (
                  <p className="mt-1.5 text-[11.5px] text-[var(--color-ink-3)]">
                    +{row.totalPrices - row.prices.length}{" "}
                    {prefersHindi(lang) ? "और फ़सलें" : "more crops"}
                  </p>
                )}

                <Link
                  href={`/farmer/sell?crop=${row.prices[0]?.cropId ?? "onion"}&qty=1000&grade=B&since=6&radius=${Math.max(radiusKm, Math.ceil(row.distanceKm) + 10)}`}
                  className="mt-2 block text-[13px] underline decoration-dotted underline-offset-2 text-[var(--color-keep)]"
                >
                  {prefersHindi(lang)
                    ? "यहाँ भेजने पर कितना मिलेगा?"
                    : "What would I take home sending here?"}
                </Link>
              </div>
            </Slip>
          ))}
        </div>
      )}

      <p className="mt-4 text-[12px] leading-snug text-[var(--color-ink-3)]">
        {prefersHindi(lang)
          ? "“लाइव” भाव भारत सरकार के Agmarknet फ़ीड से आते हैं। जिन मंडियों ने आज भाव नहीं भेजा, उनके लिए ऐप का अपना अनुमान दिखता है — भाव के साथ उसकी उम्र लिखी रहती है।"
          : "“Live” prices come from the Government of India Agmarknet feed. Mandis that have not reported today show the app’s shipped baseline instead, and every figure carries its age."}
      </p>
    </Page>
  );
}
