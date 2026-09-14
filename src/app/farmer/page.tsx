import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { listings, crops, loads, trips, mandis, transactions } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { Page } from "@/components/Shell";
import { Slip, SlipHeading, Line } from "@/components/Slip";
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

  return (
    <Page user={user} lang={lang} active="home" unread={unread}>
      {/* The primary action gets the weight. Everything else on this screen is status. */}
      <Link
        href="/farmer/sell"
        role="button"
        className="mb-6 flex items-center justify-between gap-3 rounded-[3px] bg-[var(--color-keep)] px-5 py-4 text-[var(--color-paper-2)]"
      >
        <span>
          <span className="block font-display text-[20px] font-700 uppercase tracking-[0.06em]">
            {t("sell", lang)}
          </span>
          <span className="block text-[13px] opacity-85">
            {lang === "hi"
              ? "सबसे ज़्यादा देने वाली मंडी खोजें"
              : "Find the mandi that pays you most"}
          </span>
        </span>
        <span aria-hidden className="text-[26px] leading-none">
          →
        </span>
      </Link>

      {/*
        Earnings has no slot in the bottom bar, so it lives here — as the amount due
        when something is, and as a plain way in when nothing is. A farmer should
        never have to hunt for their own ledger.
      */}
      <Link href="/farmer/earnings" className="mb-6 block">
        <Slip>
          <SlipHeading right={totalDue > 0 ? `${dues.length}` : undefined}>
            {totalDue > 0 ? t("due", lang) : t("earnings", lang)}
          </SlipHeading>
          <div className="flex items-baseline justify-between pt-2">
            <span className="text-[14px] text-[var(--color-ink-2)]">
              {totalDue > 0
                ? t("dueIn7Days", lang)
                : lang === "hi"
                  ? "कमाई और पिछली बिक्री देखें"
                  : "Your income and past sales"}
            </span>
            {totalDue > 0 ? (
              <span className="tnum text-[22px] font-600 text-[var(--color-lose)]">
                {rupees(totalDue)}
              </span>
            ) : (
              <span aria-hidden className="text-[20px] text-[var(--color-ink-3)]">
                →
              </span>
            )}
          </div>
        </Slip>
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
          <p className="py-6 text-center text-[15px] text-[var(--color-ink-3)]">
            {lang === "hi"
              ? "अभी कोई उपज दर्ज नहीं है।"
              : "Nothing listed yet. Start with “Sell produce”."}
          </p>
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
