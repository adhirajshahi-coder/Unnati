import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { transactions, loads, trips, mandis, crops } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { unreadCount, BILLING_NOTICE_DAYS } from "@/lib/notifications";
import { Page } from "@/components/Shell";
import { Slip, SlipHeading, Line, Stamp } from "@/components/Slip";
import { PayButton } from "@/components/PayButton";
import { rupees, t, weight } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Income tracker — FR-11, and the "gross vs net after transport" view from PRD §5.6.
 *
 * The number that matters is what the farmer kept, so that is what gets the stamp.
 * Gross sale value is shown as a line item on the way there, not as the headline —
 * headlining gross would repeat exactly the mistake the product exists to correct.
 */
export default async function EarningsPage() {
  const user = await currentUser();
  if (!user) redirect("/");

  const db = await getDb();
  const lang = user.language;
  const unread = await unreadCount(user.id);

  const txns = await db
    .select()
    .from(transactions)
    .where(eq(transactions.userId, user.id))
    .orderBy(desc(transactions.createdAt));

  const delivered = await db
    .select({
      loadId: loads.id,
      quantityKg: loads.quantityKg,
      costShare: loads.costShare,
      salePricePerQuintal: loads.salePricePerQuintal,
      mandiName: mandis.name,
      mandiNameHi: mandis.nameHi,
      cropName: crops.name,
      cropNameHi: crops.nameHi,
      departAt: trips.departAt,
    })
    .from(loads)
    .innerJoin(trips, eq(trips.id, loads.tripId))
    .innerJoin(mandis, eq(mandis.id, trips.mandiId))
    .innerJoin(crops, eq(crops.id, loads.cropId))
    .where(and(eq(loads.farmerId, user.id), eq(loads.status, "DELIVERED")))
    .orderBy(desc(trips.departAt));

  const mine = delivered;

  const grossTotal = txns
    .filter((t) => t.kind === "SALE_PROCEEDS")
    .reduce((s, t) => s + t.amount, 0);

  const transportTotal = txns
    .filter((t) => t.kind === "TRANSPORT_CHARGE")
    .reduce((s, t) => s + t.amount, 0);

  const netTotal = grossTotal - transportTotal;

  const dues = txns.filter(
    (t) => t.status === "DUE" && t.kind === "TRANSPORT_CHARGE",
  );

  return (
    <Page user={user} lang={lang} active="earnings" unread={unread}>
      <Slip lifted className="mb-5">
        <SlipHeading>
          {lang === "hi" ? "अब तक की कमाई" : "Income so far"}
        </SlipHeading>

        <div className="border-t-2 border-[var(--color-ink)] pt-1">
          <Line
            index={0}
            label={lang === "hi" ? "मंडी से मिला" : "Received from mandis"}
            value={rupees(grossTotal)}
            strong
          />
          <Line
            index={1}
            label={t("transport", lang)}
            value={`− ${rupees(transportTotal)}`}
            tone="lose"
          />
        </div>

        <div className="mt-4">
          <Stamp
            label={lang === "hi" ? "आपके पास बचा" : "Kept"}
            value={rupees(netTotal)}
          />
        </div>

        {grossTotal > 0 && (
          <p className="mt-3 text-[13px] leading-snug text-[var(--color-ink-2)]">
            {lang === "hi"
              ? `ढुलाई आपकी कुल बिक्री का ${Math.round((transportTotal / grossTotal) * 100)}% रही। ट्रक साझा करने से यह हिस्सा घटता है।`
              : `Transport took ${Math.round((transportTotal / grossTotal) * 100)}% of your sales. Sharing a truck is what brings that share down.`}
          </p>
        )}
      </Slip>

      {dues.length > 0 && (
        <section className="mb-5">
          <SlipHeading right={`${dues.length}`}>{t("due", lang)}</SlipHeading>
          <div className="mt-2 space-y-3">
            {dues.map((d) => {
              const daysLeft = d.dueDate
                ? Math.ceil(
                    (new Date(d.dueDate).getTime() - Date.now()) / 86_400_000,
                  )
                : null;
              const warned = daysLeft !== null && daysLeft <= BILLING_NOTICE_DAYS;

              return (
                <Slip key={d.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-[15px]">{d.note}</span>
                      {d.dueDate && (
                        <span
                          className={`tnum block text-[12.5px] ${
                            warned
                              ? "text-[var(--color-lose)]"
                              : "text-[var(--color-ink-3)]"
                          }`}
                        >
                          {lang === "hi" ? "देय" : "Due"}{" "}
                          {new Date(d.dueDate).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                          })}
                          {daysLeft !== null &&
                            ` · ${daysLeft} ${lang === "hi" ? "दिन बाकी" : "days left"}`}
                        </span>
                      )}
                    </span>
                    <span className="tnum shrink-0 text-[20px] font-600 text-[var(--color-lose)]">
                      {rupees(d.amount)}
                    </span>
                  </div>

                  {warned && (
                    <p className="mt-2 rounded-[3px] bg-[var(--color-lose-soft)] px-2 py-1.5 text-[12.5px] text-[var(--color-lose)]">
                      {lang === "hi"
                        ? "आपको 7 दिन पहले SMS भेजा जा चुका है।"
                        : "You were sent an SMS reminder seven days before this date."}
                    </p>
                  )}

                  <PayButton transactionId={d.id} lang={lang} amount={d.amount} />
                </Slip>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <SlipHeading right={`${mine.length}`}>
          {lang === "hi" ? "पिछली बिक्री" : "Past sales"}
        </SlipHeading>

        {mine.length === 0 ? (
          <p className="py-8 text-center text-[15px] text-[var(--color-ink-3)]">
            {lang === "hi" ? "अभी कोई बिक्री नहीं।" : "No completed sales yet."}
          </p>
        ) : (
          <ul className="mt-1">
            {mine.map((m) => {
              const gross = m.salePricePerQuintal
                ? Math.round((m.salePricePerQuintal * m.quantityKg) / 100)
                : 0;
              return (
                <li
                  key={m.loadId}
                  className="border-b border-dotted border-[var(--color-rule)] py-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[15px]">
                        {lang === "hi" ? m.cropNameHi : m.cropName} ·{" "}
                        {weight(m.quantityKg, lang)}
                      </span>
                      <span className="tnum block text-[12.5px] text-[var(--color-ink-3)]">
                        {lang === "hi" ? m.mandiNameHi : m.mandiName} ·{" "}
                        {new Date(m.departAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                        })}
                        {m.salePricePerQuintal
                          ? ` · ${rupees(m.salePricePerQuintal)}/${t("quintal", lang)}`
                          : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="tnum block text-[16px] font-600 text-[var(--color-keep)]">
                        {rupees(gross - m.costShare)}
                      </span>
                      <span className="tnum block text-[11.5px] text-[var(--color-ink-3)]">
                        {rupees(gross)} − {rupees(m.costShare)}
                      </span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Page>
  );
}
