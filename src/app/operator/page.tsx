import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { trips, trucks, mandis, loads } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { Page } from "@/components/Shell";
import { Slip, SlipHeading } from "@/components/Slip";
import { ClaimGroupButton } from "@/components/ClaimGroupButton";
import { poolsAwaitingTruck } from "@/lib/pools";
import { tripCost } from "@/lib/engine/costs";
import { rupees, t, weight } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Operator dashboard.
 *
 * The operator's question is the mirror of the farmer's: not "where do I sell" but
 * "is this truck going out full". Fill rate is therefore the headline on every trip —
 * it is the number that decides whether the run makes money, and PRD §10 targets 80%.
 */
export default async function OperatorHome() {
  const user = await currentUser();
  if (!user) redirect("/");
  if (user.role === "FARMER") redirect("/farmer");

  const db = await getDb();
  const lang = user.language;
  const unread = await unreadCount(user.id);

  const myTrips = await db
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
    })
    .from(trips)
    .innerJoin(trucks, eq(trucks.id, trips.truckId))
    .innerJoin(mandis, eq(mandis.id, trips.mandiId))
    .where(eq(trucks.operatorId, user.id))
    .orderBy(desc(trips.departAt));

  const pendingCounts = await db
    .select({ tripId: loads.tripId, n: sql<number>`count(*)::int` })
    .from(loads)
    .innerJoin(trips, eq(trips.id, loads.tripId))
    .innerJoin(trucks, eq(trucks.id, trips.truckId))
    .where(and(eq(trucks.operatorId, user.id), eq(loads.status, "REQUESTED")))
    .groupBy(loads.tripId);

  const pendingByTrip = new Map(pendingCounts.map((p) => [p.tripId, p.n]));
  const totalPending = pendingCounts.reduce((s, p) => s + p.n, 0);

  const active = myTrips.filter((t) =>
    (["OPEN", "FULL", "IN_TRANSIT"] as string[]).includes(t.status),
  );
  const past = myTrips.filter((t) => !active.includes(t));

  const delivered = myTrips.filter((t) => t.status === "DELIVERED");
  const avgFill =
    delivered.length > 0
      ? Math.round(
          delivered.reduce((s, t) => s + (t.usedKg / t.capacityKg) * 100, 0) /
            delivered.length,
        )
      : null;

  const myTrucks = await db
    .select()
    .from(trucks)
    .where(eq(trucks.operatorId, user.id));

  const availableTrucks = myTrucks.filter((t) =>
    (["AVAILABLE"] as string[]).includes(t.status),
  );

  // Farmers who have organised themselves into a load and are waiting for anyone to
  // carry it. This is demand that already exists — the operator does not have to
  // gamble on opening a run and hoping it fills.
  const waitingGroups = await poolsAwaitingTruck({
    lat: user.lat ?? 20.0806,
    lng: user.lng ?? 74.1103,
  });

  return (
    <Page user={user} lang={lang} active="home" unread={unread}>
      {waitingGroups.length > 0 && availableTrucks.length > 0 && (
        <section className="mb-6">
          <SlipHeading right={`${waitingGroups.length}`}>
            {t("groupsWaiting", lang)}
          </SlipHeading>

          <div className="mt-2 space-y-3">
            {waitingGroups.map((g, i) => {
              // What the run is worth: the whole-vehicle charge for the smallest
              // truck of ours that can carry the group.
              const truck =
                myTrucks
                  .filter((tr) => tr.capacityKg >= g.committedKg)
                  .sort((a, b) => a.capacityKg - b.capacityKg)[0] ?? null;
              const revenue = truck
                ? tripCost(g.distanceKm, truck.ratePerKm)
                : 0;

              return (
                <Slip key={g.id}>
                  <div
                    className="print-in"
                    style={{ "--i": i } as React.CSSProperties}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-[18px]">
                        {lang === "hi" ? g.mandiNameHi : g.mandiName}
                      </h3>
                      <span className="tnum shrink-0 text-[13px] font-600 text-[var(--color-pool)]">
                        {weight(g.committedKg, lang)}
                      </span>
                    </div>

                    <p className="tnum text-[12.5px] text-[var(--color-ink-3)]">
                      {g.memberCount} {lang === "hi" ? "किसान" : "farmers"} ·{" "}
                      {g.originName} → {Math.round(g.distanceKm)} km ·{" "}
                      {new Date(g.targetDepartAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>

                    <ClaimGroupButton
                      poolId={g.id}
                      lang={lang}
                      committedKg={g.committedKg}
                      estimatedRevenue={revenue}
                      trucks={availableTrucks.map((tr) => ({
                        id: tr.id,
                        label: `${tr.vehicleType} · ${tr.regNo} · ${weight(tr.capacityKg, lang)}`,
                        capacityKg: tr.capacityKg,
                      }))}
                    />
                  </div>
                </Slip>
              );
            })}
          </div>
        </section>
      )}

      {totalPending > 0 && (
        <div className="mb-5 rounded-[3px] border-2 border-[var(--color-pool)] bg-[var(--color-pool-soft)] px-4 py-3">
          <div className="font-display text-[11px] font-700 uppercase tracking-[0.16em] text-[var(--color-pool)]">
            {t("pendingRequests", lang)}
          </div>
          <p className="mt-0.5 text-[15px]">
            {lang === "hi"
              ? `${totalPending} किसान आपके ट्रक में जगह माँग रहे हैं।`
              : `${totalPending} farmers are asking for space on your trucks.`}
          </p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-3 gap-2">
        <Stat
          label={lang === "hi" ? "ट्रक" : "Trucks"}
          value={String(myTrucks.length)}
        />
        <Stat
          label={lang === "hi" ? "चालू यात्राएँ" : "Active trips"}
          value={String(active.length)}
        />
        <Stat
          label={t("fillRate", lang)}
          value={avgFill === null ? "—" : `${avgFill}%`}
          tone={avgFill !== null && avgFill >= 80 ? "keep" : "pool"}
        />
      </div>

      {availableTrucks.length > 0 && (
        <Link
          href="/operator/trucks"
          role="button"
          className="mb-6 flex items-center justify-between gap-3 rounded-[3px] bg-[var(--color-keep)] px-5 py-4 text-[var(--color-paper-2)]"
        >
          <span>
            <span className="block font-display text-[19px] font-700 uppercase tracking-[0.06em]">
              {t("openTrip", lang)}
            </span>
            <span className="block text-[13px] opacity-85">
              {lang === "hi"
                ? "आस-पास के किसानों को सूचना चली जाएगी"
                : "Nearby farmers are told automatically"}
            </span>
          </span>
          <span aria-hidden className="text-[26px] leading-none">
            →
          </span>
        </Link>
      )}

      <section className="mb-6">
        <SlipHeading right={`${active.length}`}>
          {lang === "hi" ? "चालू यात्राएँ" : "Active trips"}
        </SlipHeading>

        {active.length === 0 ? (
          <p className="py-6 text-center text-[15px] text-[var(--color-ink-3)]">
            {t("noTrips", lang)}
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {active.map((trip, i) => {
              const fill = Math.round((trip.usedKg / trip.capacityKg) * 100);
              const pending = pendingByTrip.get(trip.id) ?? 0;

              return (
                <Link key={trip.id} href={`/operator/trip/${trip.id}`}>
                  <Slip>
                    <div
                      className="print-in"
                      style={{ "--i": i } as React.CSSProperties}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-[19px]">
                          {lang === "hi" ? trip.mandiNameHi : trip.mandiName}
                        </h3>
                        {pending > 0 && (
                          <span className="tnum shrink-0 rounded-[3px] bg-[var(--color-pool)] px-2 py-0.5 text-[12px] font-600 text-[var(--color-paper-2)]">
                            {pending} {lang === "hi" ? "नए" : "new"}
                          </span>
                        )}
                      </div>
                      <p className="tnum text-[12.5px] text-[var(--color-ink-3)]">
                        {trip.regNo} · {trip.originName} → {trip.baseDistanceKm} km ·{" "}
                        {new Date(trip.departAt).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </p>

                      <div className="mt-3">
                        <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
                          <span className="text-[var(--color-ink-2)]">
                            {weight(trip.usedKg, lang)} /{" "}
                            {weight(trip.capacityKg, lang)}
                          </span>
                          <span
                            className={`tnum font-600 ${
                              fill >= 80
                                ? "text-[var(--color-keep)]"
                                : "text-[var(--color-pool)]"
                            }`}
                          >
                            {fill}%
                          </span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-[2px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)]">
                          <div
                            className={
                              fill >= 80
                                ? "h-full bg-[var(--color-keep)]"
                                : "h-full bg-[var(--color-pool)]"
                            }
                            style={{ width: `${fill}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </Slip>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <SlipHeading right={`${past.length}`}>
            {lang === "hi" ? "पिछली यात्राएँ" : "Past trips"}
          </SlipHeading>
          <ul className="mt-1">
            {past.slice(0, 10).map((trip) => (
              <li
                key={trip.id}
                className="flex items-baseline justify-between gap-3 border-b border-dotted border-[var(--color-rule)] py-2.5"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px]">
                    {lang === "hi" ? trip.mandiNameHi : trip.mandiName}
                  </span>
                  <span className="tnum block text-[12px] text-[var(--color-ink-3)]">
                    {trip.regNo} ·{" "}
                    {new Date(trip.departAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tnum block text-[15px] font-600">
                    {rupees(trip.totalCost)}
                  </span>
                  <span className="tnum block text-[11.5px] text-[var(--color-ink-3)]">
                    {Math.round((trip.usedKg / trip.capacityKg) * 100)}% full
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "keep" | "pool";
}) {
  const color = {
    neutral: "text-ink",
    keep: "text-[var(--color-keep)]",
    pool: "text-[var(--color-pool)]",
  }[tone];

  return (
    <div className="rounded-[3px] border border-[var(--color-rule)] bg-[var(--color-paper-2)] px-2 py-2.5 text-center">
      <div className={`tnum text-[24px] font-600 leading-none ${color}`}>
        {value}
      </div>
      <div className="mt-1 text-[11.5px] leading-tight text-[var(--color-ink-3)]">
        {label}
      </div>
    </div>
  );
}
