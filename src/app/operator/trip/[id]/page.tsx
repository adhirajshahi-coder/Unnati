import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { trips, trucks, mandis, users, crops, loads } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { bestFillFor } from "@/lib/booking";
import { Page } from "@/components/Shell";
import { Slip, SlipHeading, Line } from "@/components/Slip";
import { LoadDecision, TripControls } from "@/components/OperatorControls";
import { rupees, t, weight } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Trip control for the operator: accept or decline requests, see the best-fill
 * suggestion, move the trip through its lifecycle.
 *
 * The suggestion is advisory. It tells the operator which combination of pending
 * requests fills the truck most profitably, and why each rejected one was rejected,
 * but the operator decides — they know things about a road or a farmer that no
 * optimiser does.
 */
export default async function OperatorTripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/");
  if (user.role === "FARMER") redirect("/farmer");

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
      mandiName: mandis.name,
      mandiNameHi: mandis.nameHi,
      regNo: trucks.regNo,
      vehicleType: trucks.vehicleType,
      ratePerKm: trucks.ratePerKm,
      operatorId: trucks.operatorId,
    })
    .from(trips)
    .innerJoin(trucks, eq(trucks.id, trips.truckId))
    .innerJoin(mandis, eq(mandis.id, trips.mandiId))
    .where(eq(trips.id, id))
    .limit(1);

  if (!trip) notFound();
  if (trip.operatorId !== user.id && user.role !== "ADMIN") redirect("/operator");

  const { fill } = await bestFillFor(id, trip.operatorId);

  const confirmed = await db
    .select({
      id: loads.id,
      farmerName: users.name,
      farmerPhone: users.phone,
      quantityKg: loads.quantityKg,
      costShare: loads.costShare,
      detourKm: loads.detourKm,
      pickupName: loads.pickupName,
      status: loads.status,
      cropName: crops.name,
      cropNameHi: crops.nameHi,
    })
    .from(loads)
    .innerJoin(users, eq(users.id, loads.farmerId))
    .innerJoin(crops, eq(crops.id, loads.cropId))
    .where(
      and(
        eq(loads.tripId, id),
        inArray(loads.status, ["CONFIRMED", "PICKED_UP", "DELIVERED"]),
      ),
    );

  const fillRate = Math.round((trip.usedKg / trip.capacityKg) * 100);
  const revenue = confirmed.reduce((s, c) => s + c.costShare, 0);
  const suggestedIds = new Set(fill.selected.map((s) => s.id));

  return (
    <Page user={user} lang={lang} active="home" unread={unread}>
      <Slip lifted className="mb-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display text-[11px] font-700 uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
              {trip.originName} →
            </div>
            <h1 className="text-[26px] leading-tight">
              {lang === "hi" ? trip.mandiNameHi : trip.mandiName}
            </h1>
            <div className="tnum text-[12.5px] text-[var(--color-ink-3)]">
              {trip.vehicleType} · {trip.regNo} · {trip.baseDistanceKm} km
            </div>
          </div>
        </div>

        <div className="border-t-2 border-[var(--color-ink)] pt-1">
          <Line
            index={0}
            label={t("departs", lang)}
            value={new Date(trip.departAt).toLocaleString("en-IN", {
              day: "numeric",
              month: "short",
              hour: "numeric",
              minute: "2-digit",
            })}
          />
          <Line
            index={1}
            label={t("fillRate", lang)}
            sub={`${weight(trip.usedKg, lang)} / ${weight(trip.capacityKg, lang)}`}
            value={`${fillRate}%`}
            tone={fillRate >= 80 ? "keep" : "pool"}
            strong
          />
          <Line
            index={2}
            label={lang === "hi" ? "अब तक की कमाई" : "Booked revenue"}
            sub={`${lang === "hi" ? "यात्रा की लागत" : "Trip cost"} ${rupees(trip.totalCost)}`}
            value={rupees(revenue)}
            tone={revenue >= trip.totalCost ? "keep" : "lose"}
          />
        </div>

        <TripControls
          tripId={trip.id}
          status={trip.status}
          lang={lang}
          className="mt-4"
        />
      </Slip>

      {fill.rejected.length + fill.selected.length > 0 && (
        <section className="mb-5">
          <SlipHeading
            right={
              fill.selected.length > 0
                ? `+${rupees(fill.totalValue)} · ${fill.fillRate}%`
                : undefined
            }
          >
            {t("bestFill", lang)}
          </SlipHeading>

          {fill.selected.length > 0 && (
            <p className="mt-2 rounded-[3px] bg-[var(--color-keep-soft)] px-3 py-2 text-[13.5px] leading-snug text-[var(--color-keep)]">
              {lang === "hi"
                ? `इन ${fill.selected.length} लोड को लेने पर ट्रक ${fill.fillRate}% भर जाएगा और ${rupees(fill.totalValue)} की अतिरिक्त कमाई होगी। कुल ${fill.totalDetourKm} किमी अतिरिक्त चलना पड़ेगा।`
                : `Taking these ${fill.selected.length} loads fills the truck to ${fill.fillRate}% and adds ${rupees(fill.totalValue)}, for ${fill.totalDetourKm} km of extra driving.`}
            </p>
          )}

          <div className="mt-3 space-y-3">
            {[...fill.selected, ...fill.rejected].map((l) => (
              <Slip key={l.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-[17px]">{l.farmerName}</h3>
                  {suggestedIds.has(l.id) ? (
                    <span className="shrink-0 rounded-[3px] bg-[var(--color-keep)] px-2 py-0.5 text-[11.5px] font-600 text-[var(--color-paper-2)]">
                      {lang === "hi" ? "सुझाव" : "Suggested"}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-[3px] border border-[var(--color-rule-strong)] px-2 py-0.5 text-[11.5px] text-[var(--color-ink-3)]">
                      {!l.meetsDeadline
                        ? lang === "hi"
                          ? "समय नहीं मिलेगा"
                          : "Misses departure"
                        : l.netValue <= 0
                          ? lang === "hi"
                            ? "चक्कर महँगा"
                            : "Detour costs more than it pays"
                          : lang === "hi"
                            ? "जगह नहीं"
                            : "Does not fit"}
                    </span>
                  )}
                </div>

                <p className="tnum text-[12.5px] text-[var(--color-ink-3)]">
                  {l.cropName} · {weight(l.quantityKg, lang)} · {l.pickupName}
                </p>

                <div className="mt-1">
                  <Line
                    label={lang === "hi" ? "किराया" : "Pays"}
                    value={rupees(l.revenue)}
                    tone="keep"
                  />
                  <Line
                    label={lang === "hi" ? "अतिरिक्त चक्कर" : "Detour"}
                    sub={`${l.detourKm} km`}
                    value={`− ${rupees(l.detourCost)}`}
                    tone="lose"
                  />
                  <Line
                    label={lang === "hi" ? "शुद्ध लाभ" : "Net to you"}
                    value={rupees(l.netValue)}
                    tone={l.netValue > 0 ? "keep" : "lose"}
                    strong
                  />
                </div>

                <LoadDecision loadId={l.id} lang={lang} />
              </Slip>
            ))}
          </div>
        </section>
      )}

      <section className="mb-5">
        <SlipHeading right={`${confirmed.length}`}>
          {lang === "hi" ? "पक्के लोड" : "Confirmed loads"}
        </SlipHeading>

        {confirmed.length === 0 ? (
          <p className="py-6 text-center text-[15px] text-[var(--color-ink-3)]">
            {lang === "hi"
              ? "अभी कोई लोड पक्का नहीं हुआ।"
              : "Nothing confirmed yet."}
          </p>
        ) : (
          <ul className="mt-1">
            {confirmed.map((c) => (
              <li
                key={c.id}
                className="flex items-baseline justify-between gap-3 border-b border-dotted border-[var(--color-rule)] py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px]">
                    {c.farmerName}{" "}
                    <a
                      href={`tel:${c.farmerPhone}`}
                      className="text-[12.5px] underline decoration-dotted underline-offset-2 text-[var(--color-ink-3)]"
                    >
                      {c.farmerPhone}
                    </a>
                  </span>
                  <span className="tnum block text-[12px] text-[var(--color-ink-3)]">
                    {lang === "hi" ? c.cropNameHi : c.cropName} ·{" "}
                    {weight(c.quantityKg, lang)} · {c.pickupName}
                    {c.detourKm > 0 ? ` · +${c.detourKm} km` : ""}
                  </span>
                </span>
                <span className="tnum shrink-0 text-[15px]">
                  {rupees(c.costShare)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link
        href="/operator"
        className="block text-center text-[14px] underline decoration-dotted underline-offset-2 text-[var(--color-ink-2)]"
      >
        {t("back", lang)}
      </Link>
    </Page>
  );
}
