import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { trucks, mandis } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { Page } from "@/components/Shell";
import { Slip, SlipHeading, Line } from "@/components/Slip";
import { TruckForm, NewTripForm } from "@/components/TruckForms";
import { prefersHindi, rupees, t, weight } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function TrucksPage() {
  const user = await currentUser();
  if (!user) redirect("/");
  if (user.role === "FARMER") redirect("/farmer");

  const db = await getDb();
  const lang = user.language;
  const unread = await unreadCount(user.id);

  const myTrucks = await db
    .select()
    .from(trucks)
    .where(eq(trucks.operatorId, user.id))
    .orderBy(trucks.regNo);

  const mandiList = await db.select().from(mandis).orderBy(mandis.name);

  return (
    <Page user={user} lang={lang} active="trucks" unread={unread}>
      {myTrucks.length > 0 && (
        <section className="mb-6">
          <SlipHeading right={`${myTrucks.length}`}>
            {t("trucks", lang)}
          </SlipHeading>

          <div className="mt-2 space-y-3">
            {myTrucks.map((truck, i) => {
              const rating =
                truck.ratingCount > 0
                  ? (truck.ratingSum / truck.ratingCount).toFixed(1)
                  : null;

              return (
                <Slip key={truck.id}>
                  <div
                    className="print-in"
                    style={{ "--i": i } as React.CSSProperties}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="tnum text-[19px]">{truck.regNo}</h3>
                      <span className="text-[12.5px] text-[var(--color-ink-3)]">
                        {truck.status === "AVAILABLE"
                          ? prefersHindi(lang)
                            ? "खाली"
                            : "Available"
                          : truck.status === "ON_TRIP"
                            ? prefersHindi(lang)
                              ? "यात्रा पर"
                              : "On a trip"
                            : prefersHindi(lang)
                              ? "बंद"
                              : "Offline"}
                      </span>
                    </div>
                    <p className="text-[13px] text-[var(--color-ink-2)]">
                      {truck.vehicleType}
                      {rating ? ` · ★ ${rating}` : ""}
                    </p>

                    <div className="mt-1">
                      <Line
                        label={t("capacity", lang)}
                        value={weight(truck.capacityKg, lang)}
                      />
                      <Line
                        label={t("ratePerKm", lang)}
                        value={rupees(truck.ratePerKm)}
                      />
                    </div>

                    {truck.status === "AVAILABLE" && (
                      <NewTripForm
                        truckId={truck.id}
                        lang={lang}
                        defaultOrigin={user.village ?? "Depot"}
                        mandis={mandiList.map((m) => ({
                          id: m.id,
                          label: `${prefersHindi(lang) ? m.nameHi : m.name} · ${m.district}`,
                        }))}
                      />
                    )}
                  </div>
                </Slip>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <SlipHeading>{t("addTruck", lang)}</SlipHeading>
        <div className="mt-2">
          <TruckForm lang={lang} />
        </div>
      </section>
    </Page>
  );
}
