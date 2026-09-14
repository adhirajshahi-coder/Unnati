import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { loads, trips, mandis, crops, trucks } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { findJoinableTrips } from "@/lib/booking";
import { Page } from "@/components/Shell";
import { Slip, SlipHeading } from "@/components/Slip";
import { rupees, t, weight } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function FarmerTrips() {
  const user = await currentUser();
  if (!user) redirect("/");

  const db = await getDb();
  const lang = user.language;
  const unread = await unreadCount(user.id);

  const mine = await db
    .select({
      loadId: loads.id,
      status: loads.status,
      quantityKg: loads.quantityKg,
      costShare: loads.costShare,
      tripId: trips.id,
      tripStatus: trips.status,
      departAt: trips.departAt,
      mandiName: mandis.name,
      mandiNameHi: mandis.nameHi,
      cropName: crops.name,
      cropNameHi: crops.nameHi,
      regNo: trucks.regNo,
    })
    .from(loads)
    .innerJoin(trips, eq(trips.id, loads.tripId))
    .innerJoin(trucks, eq(trucks.id, trips.truckId))
    .innerJoin(mandis, eq(mandis.id, trips.mandiId))
    .innerJoin(crops, eq(crops.id, loads.cropId))
    .where(eq(loads.farmerId, user.id))
    .orderBy(desc(trips.departAt));

  // Trucks the farmer could still join, sized for a typical smallholder consignment.
  const available = await findJoinableTrips(
    { lat: user.lat ?? 20.0806, lng: user.lng ?? 74.1103 },
    500,
  );
  const alreadyOn = new Set(mine.map((m) => m.tripId));
  const joinable = available.filter((a) => !alreadyOn.has(a.id));

  return (
    <Page user={user} lang={lang} active="trips" unread={unread}>
      {joinable.length > 0 && (
        <section className="mb-6">
          <SlipHeading right={`${joinable.length}`}>
            {t("poolingAvailable", lang)}
          </SlipHeading>
          <div className="mt-2 space-y-3">
            {joinable.map((j, i) => (
              <Link key={j.id} href={`/farmer/join/${j.id}`}>
                <Slip>
                  <div
                    className="print-in"
                    style={{ "--i": i } as React.CSSProperties}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-[18px]">{j.mandiName}</h3>
                      <span className="tnum text-[12.5px] text-[var(--color-pool)]">
                        {weight(j.capacityKg - j.usedKg, lang)}{" "}
                        {t("spaceLeft", lang)}
                      </span>
                    </div>
                    <p className="tnum mt-0.5 text-[12.5px] text-[var(--color-ink-3)]">
                      {j.vehicleType} · {j.originName} → {j.baseDistanceKm} km ·{" "}
                      {new Date(j.departAt).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="mt-2 text-[13.5px] text-[var(--color-ink-2)]">
                      {j.farmerCount}{" "}
                      {lang === "hi"
                        ? "किसान पहले से साझा कर रहे हैं"
                        : "farmers already sharing"}
                      {j.detourKm === 0
                        ? lang === "hi"
                          ? " · आप रास्ते में ही हैं"
                          : " · you are on the route"
                        : ` · ${j.detourKm} km detour`}
                    </p>
                  </div>
                </Slip>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <SlipHeading right={`${mine.length}`}>{t("myTrips", lang)}</SlipHeading>

        {mine.length === 0 ? (
          <p className="py-8 text-center text-[15px] text-[var(--color-ink-3)]">
            {t("noTrips", lang)}
          </p>
        ) : (
          <ul className="mt-1">
            {mine.map((m) => (
              <li key={m.loadId}>
                <Link
                  href={`/farmer/trip/${m.tripId}`}
                  className="flex items-baseline justify-between gap-3 border-b border-dotted border-[var(--color-rule)] py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[16px] font-500">
                      {lang === "hi" ? m.mandiNameHi : m.mandiName}
                    </span>
                    <span className="tnum block text-[12.5px] text-[var(--color-ink-3)]">
                      {lang === "hi" ? m.cropNameHi : m.cropName} ·{" "}
                      {weight(m.quantityKg, lang)} ·{" "}
                      {new Date(m.departAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-right text-[15px]">
                    {m.status === "REQUESTED"
                      ? lang === "hi"
                        ? "इंतज़ार"
                        : "pending"
                      : rupees(m.costShare)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Page>
  );
}
