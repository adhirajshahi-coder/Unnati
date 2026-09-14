import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  users,
  trips,
  loads,
  trucks,
  mandis,
  priceRecords,
  feedHealth,
  transactions,
  notifications,
} from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { Page } from "@/components/Shell";
import { Slip, SlipHeading, Line } from "@/components/Slip";
import { IngestButton } from "@/components/IngestButton";
import { hasApiKey } from "@/lib/pricefeed";
import { rupees, weight } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Ops dashboard — PDD §4.2 module 6.
 *
 * Two things matter to whoever runs the pilot: is the price feed healthy, and is
 * pooling actually working. Everything else is counting.
 */
export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  if (user.role !== "ADMIN") {
    redirect(user.role === "OPERATOR" ? "/operator" : "/farmer");
  }

  const db = await getDb();
  const lang = user.language;
  const unread = await unreadCount(user.id);

  const [counts] = await db
    .select({
      farmers: sql<number>`count(*) filter (where ${users.role} = 'FARMER')::int`,
      operators: sql<number>`count(*) filter (where ${users.role} = 'OPERATOR')::int`,
    })
    .from(users);

  const [truckCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(trucks);

  const allTrips = await db
    .select({
      id: trips.id,
      status: trips.status,
      capacityKg: trips.capacityKg,
      usedKg: trips.usedKg,
      totalCost: trips.totalCost,
      departAt: trips.departAt,
      mandiName: mandis.name,
      regNo: trucks.regNo,
    })
    .from(trips)
    .innerJoin(trucks, eq(trucks.id, trips.truckId))
    .innerJoin(mandis, eq(mandis.id, trips.mandiId))
    .orderBy(desc(trips.departAt));

  const [loadStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${loads.status} = 'REQUESTED')::int`,
      confirmed: sql<number>`count(*) filter (where ${loads.status} <> 'REQUESTED' and ${loads.status} <> 'REJECTED')::int`,
      tonnage: sql<number>`coalesce(sum(${loads.quantityKg}), 0)::int`,
    })
    .from(loads);

  const feeds = await db.select().from(feedHealth).orderBy(feedHealth.id);

  const [priceStats] = await db
    .select({
      n: sql<number>`count(*)::int`,
      newest: sql<Date>`max(${priceRecords.recordedAt})`,
    })
    .from(priceRecords);

  const [money] = await db
    .select({
      due: sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.status} = 'DUE'), 0)::int`,
      paid: sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.status} = 'PAID'), 0)::int`,
    })
    .from(transactions);

  const [notifStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      scheduled: sql<number>`count(*) filter (where ${notifications.sentAt} is null)::int`,
    })
    .from(notifications);

  // Fill rate across trips that actually ran — the PRD's 80% target.
  const ran = allTrips.filter((t) =>
    (["IN_TRANSIT", "DELIVERED"] as string[]).includes(t.status),
  );
  const avgFill =
    ran.length > 0
      ? Math.round(
          ran.reduce((s, t) => s + (t.usedKg / t.capacityKg) * 100, 0) /
            ran.length,
        )
      : null;

  const pooled = allTrips.filter((t) => t.usedKg > 0);
  const feedAge = priceStats?.newest
    ? Math.round(
        (Date.now() - new Date(priceStats.newest).getTime()) / 3_600_000,
      )
    : null;

  return (
    <Page user={user} lang={lang} active="home" unread={unread}>
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Farmers" value={String(counts?.farmers ?? 0)} />
        <Stat label="Operators" value={String(counts?.operators ?? 0)} />
        <Stat label="Trucks" value={String(truckCount?.n ?? 0)} />
        <Stat
          label="Avg fill rate"
          value={avgFill === null ? "—" : `${avgFill}%`}
          tone={avgFill !== null && avgFill >= 80 ? "keep" : "pool"}
        />
      </div>

      <Slip className="mb-5">
        <SlipHeading
          right={feedAge === null ? undefined : `${feedAge} h old`}
        >
          Price feed health
        </SlipHeading>

        <div className="pt-1">
          {feeds.map((f, i) => (
            <Line
              key={f.id}
              index={i}
              label={f.id}
              sub={f.message ?? undefined}
              value={`${f.recordsIngested} rows`}
              tone={f.ok ? "keep" : "lose"}
            />
          ))}
          <Line
            label="Total price records"
            value={String(priceStats?.n ?? 0)}
            strong
          />
        </div>

        <IngestButton hasKey={hasApiKey()} />

        {feedAge !== null && feedAge > 24 && (
          <p className="mt-2 rounded-[3px] border border-[var(--color-lose)] bg-[var(--color-lose-soft)] px-3 py-2 text-[13px] text-[var(--color-lose)]">
            No price has been ingested in over a day. Recommendations will be
            marked low-confidence until the feed catches up.
          </p>
        )}
      </Slip>

      <Slip className="mb-5">
        <SlipHeading>Pooling</SlipHeading>
        <div className="pt-1">
          <Line index={0} label="Trips opened" value={String(allTrips.length)} />
          <Line index={1} label="Trips with pooled loads" value={String(pooled.length)} />
          <Line index={2} label="Loads booked" value={String(loadStats?.confirmed ?? 0)} />
          <Line
            index={3}
            label="Requests awaiting a decision"
            value={String(loadStats?.pending ?? 0)}
            tone={(loadStats?.pending ?? 0) > 0 ? "pool" : "neutral"}
          />
          <Line
            index={4}
            label="Produce moved"
            value={weight(loadStats?.tonnage ?? 0, "en")}
            strong
          />
        </div>
      </Slip>

      <Slip className="mb-5">
        <SlipHeading>Money and messages</SlipHeading>
        <div className="pt-1">
          <Line index={0} label="Settled" value={rupees(money?.paid ?? 0)} tone="keep" />
          <Line index={1} label="Outstanding" value={rupees(money?.due ?? 0)} tone="lose" />
          <Line index={2} label="Notifications sent" value={String((notifStats?.total ?? 0) - (notifStats?.scheduled ?? 0))} />
          <Line
            index={3}
            label="Reminders scheduled ahead"
            sub="Billing warnings waiting for their 7-day mark"
            value={String(notifStats?.scheduled ?? 0)}
          />
        </div>
      </Slip>

      <section>
        <SlipHeading right={`${allTrips.length}`}>All trips</SlipHeading>
        <div className="mt-1 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left">
            <thead>
              <tr className="border-b-2 border-[var(--color-rule-strong)] text-[11px] uppercase tracking-[0.1em] text-[var(--color-ink-3)]">
                <th className="py-1.5 font-500">Mandi</th>
                <th className="py-1.5 font-500">Truck</th>
                <th className="py-1.5 font-500">Status</th>
                <th className="py-1.5 text-right font-500">Fill</th>
                <th className="py-1.5 text-right font-500">Cost</th>
              </tr>
            </thead>
            <tbody>
              {allTrips.map((t) => {
                const fill = Math.round((t.usedKg / t.capacityKg) * 100);
                return (
                  <tr
                    key={t.id}
                    className="border-b border-dotted border-[var(--color-rule)] text-[13.5px]"
                  >
                    <td className="py-2">{t.mandiName}</td>
                    <td className="tnum py-2 text-[12.5px]">{t.regNo}</td>
                    <td className="py-2 text-[12.5px]">{t.status}</td>
                    <td
                      className={`tnum py-2 text-right ${
                        fill >= 80
                          ? "text-[var(--color-keep)]"
                          : "text-[var(--color-pool)]"
                      }`}
                    >
                      {fill}%
                    </td>
                    <td className="tnum py-2 text-right">
                      {rupees(t.totalCost)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
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
