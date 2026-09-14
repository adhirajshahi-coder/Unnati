import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { poolDetail } from "@/lib/pools";
import { projectPool, pickVehicle } from "@/lib/engine/grouping";
import { Page } from "@/components/Shell";
import { Slip, SlipHeading, Stamp } from "@/components/Slip";
import { LeaveGroupButton } from "@/components/LeaveGroupButton";
import { rupees, t, weight } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * A pooling group as it fills up.
 *
 * The screen has one job: show the farmer that their cost falls as neighbours join,
 * and make inviting them the obvious next action. Everything else — who is in, how
 * much is committed, how far off a truck it is — supports that.
 */
export default async function PoolPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/");

  const { id } = await params;
  const detail = await poolDetail(id);
  if (!detail) notFound();

  const { pool, members, committedKg } = detail;
  const lang = user.language;
  const unread = await unreadCount(user.id);

  const mine = members.find((m) => m.farmerId === user.id);
  const myKg = mine?.quantityKg ?? 0;

  const vehicle = pickVehicle(Math.max(committedKg, pool.targetCapacityKg));
  const base = projectPool(myKg, committedKg, pool.distanceKm, vehicle);

  // A detour driven to collect this farmer is charged to them alone, exactly as on a
  // booked trip. Leaving it out here would show a share lower than the one they are
  // actually billed, which is the one number on this screen that must not be wrong.
  const detourCharge = Math.round((mine?.detourKm ?? 0) * vehicle.ratePerKm);
  const projection = {
    ...base,
    shareNow: base.shareNow + detourCharge,
    shareIfFull: base.shareIfFull + detourCharge,
    savedNow: Math.max(0, base.soloCost - (base.shareNow + detourCharge)),
    savedPercentNow:
      base.soloCost > 0
        ? Math.round(
            (Math.max(0, base.soloCost - (base.shareNow + detourCharge)) /
              base.soloCost) *
              100,
          )
        : 0,
  };

  // Once a truck has taken the group, the booking itself is the place to be.
  if (pool.status === "MATCHED" && pool.tripId) {
    redirect(`/farmer/trip/${pool.tripId}`);
  }

  const mandiName = lang === "hi" ? pool.mandiNameHi : pool.mandiName;
  const ready = pool.status === "READY";

  return (
    <Page user={user} lang={lang} active="trips" unread={unread}>
      <Slip lifted className="mb-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display text-[11px] font-700 uppercase tracking-[0.18em] text-[var(--color-pool)]">
              {t("groupFor", lang)}
            </div>
            <h1 className="text-[26px] leading-tight">{mandiName}</h1>
            <div className="tnum text-[12.5px] text-[var(--color-ink-3)]">
              {pool.originName} → {Math.round(pool.distanceKm)} km ·{" "}
              {new Date(pool.targetDepartAt).toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </div>
          </div>
          <span
            className={`shrink-0 rounded-[3px] border px-2 py-1 text-[12px] font-600 ${
              ready
                ? "border-[var(--color-keep)] text-[var(--color-keep)]"
                : "border-[var(--color-pool)] text-[var(--color-pool)]"
            }`}
          >
            {ready ? t("readyForTruck", lang) : t("waitingForTruck", lang)}
          </span>
        </div>

        {/* The fill bar is the whole story: how full, how much more is needed. */}
        <div className="border-t-2 border-[var(--color-ink)] pt-3">
          <div className="mb-1 flex items-baseline justify-between text-[13px]">
            <span className="text-[var(--color-ink-2)]">
              {t("inTheGroup", lang)} · {members.length}{" "}
              {lang === "hi" ? "किसान" : "farmers"}
            </span>
            <span className="tnum font-600">
              {weight(committedKg, lang)} / {weight(vehicle.capacityKg, lang)}
            </span>
          </div>
          <div className="h-4 overflow-hidden rounded-[2px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)]">
            <div
              className={
                ready
                  ? "h-full bg-[var(--color-keep)]"
                  : "h-full bg-[var(--color-pool)]"
              }
              style={{ width: `${Math.min(100, projection.fillRate)}%` }}
            />
          </div>

          {!ready && (
            <p className="mt-2 text-[14px] leading-snug text-[var(--color-ink-2)]">
              {lang === "hi"
                ? `ट्रक मँगाने लायक होने के लिए लगभग ${weight(Math.max(0, Math.round(vehicle.capacityKg * 0.6 - committedKg)), lang)} और चाहिए।`
                : `About ${weight(Math.max(0, Math.round(vehicle.capacityKg * 0.6 - committedKg)), lang)} more and a truck owner will take this group.`}
            </p>
          )}
        </div>

        {myKg > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <Stamp
              label={t("yourCostNow", lang)}
              value={rupees(projection.shareNow)}
              tone="lose"
            />
            <div className="text-right">
              <div className="tnum text-[15px] font-600 text-[var(--color-keep)]">
                {rupees(projection.shareIfFull)}
              </div>
              <div className="text-[12px] text-[var(--color-ink-3)]">
                {t("yourCostFull", lang)}
              </div>
              <div className="tnum mt-1 text-[12px] text-[var(--color-ink-3)]">
                {t("aloneYouPay", lang)} {rupees(projection.soloCost)}
              </div>
              {detourCharge > 0 && (
                <div className="tnum mt-1 text-[11.5px] leading-tight text-[var(--color-ink-3)]">
                  {lang === "hi"
                    ? `इसमें आपके लिए ${mine?.detourKm} किमी चक्कर का ${rupees(detourCharge)} शामिल`
                    : `includes ${rupees(detourCharge)} for the ${mine?.detourKm} km detour to reach you`}
                </div>
              )}
            </div>
          </div>
        )}

        {projection.savedNow > 0 ? (
          <p className="mt-3 rounded-[3px] bg-[var(--color-keep-soft)] px-3 py-2 text-[14px] leading-snug text-[var(--color-keep)]">
            <span className="tnum font-600">
              {rupees(projection.savedNow)}
            </span>{" "}
            {lang === "hi"
              ? `बच रहे हैं — अकेले ट्रक लेने के मुकाबले ${projection.savedPercentNow}% कम।`
              : `saved so far — ${projection.savedPercentNow}% less than hiring a truck alone.`}
          </p>
        ) : (
          myKg > 0 && (
            // The group is still too small to beat a solo hire for this farmer. Saying
            // so outright is the point: a farmer who joins expecting a saving and is
            // billed more than they would have paid alone will not use this again.
            <p className="mt-3 rounded-[3px] border border-[var(--color-pool)] bg-[var(--color-pool-soft)] px-3 py-2 text-[14px] leading-snug text-[var(--color-pool)]">
              {lang === "hi"
                ? `अभी समूह छोटा है, इसलिए आपका हिस्सा अकेले ट्रक लेने से ज़्यादा है। और किसान जुड़ने पर यह घटकर ${rupees(projection.shareIfFull)} तक आ जाएगा। ट्रक मिलने तक कोई पैसा नहीं लगता।`
                : `The group is still small, so your share is more than hiring alone right now. As more farmers join it falls toward ${rupees(projection.shareIfFull)}. Nothing is charged until a truck takes the group.`}
            </p>
          )
        )}
      </Slip>

      <section className="mb-5">
        <SlipHeading right={weight(committedKg, lang)}>
          {t("inTheGroup", lang)}
        </SlipHeading>
        <ul className="mt-1">
          {members.map((m) => (
            <li
              key={m.id}
              className={`flex items-baseline justify-between gap-3 border-b border-dotted border-[var(--color-rule)] py-2.5 ${
                m.farmerId === user.id ? "font-600" : ""
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px]">
                  {m.farmerName}
                  {m.farmerId === user.id && (
                    <span className="ml-1 text-[12px] text-[var(--color-keep)]">
                      ({lang === "hi" ? "आप" : "you"})
                    </span>
                  )}
                </span>
                <span className="tnum block text-[12px] text-[var(--color-ink-3)]">
                  {lang === "hi" ? m.cropNameHi : m.cropName} ·{" "}
                  {m.pickupName}
                  {m.detourKm > 0 ? ` · +${m.detourKm} km` : ""}
                </span>
              </span>
              <span className="tnum shrink-0 text-[15px]">
                {weight(m.quantityKg, lang)}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-2 text-[12px] leading-snug text-[var(--color-ink-3)]">
          {lang === "hi"
            ? "खर्च वज़न के हिसाब से बँटेगा। ट्रक मिलने के बाद ही पक्का हिसाब बनेगा।"
            : "The cost will split by weight. Nothing is charged until a truck actually takes the group."}
        </p>
      </section>

      <Slip className="mb-5">
        <SlipHeading>
          {lang === "hi" ? "पड़ोसियों को बताएँ" : "Tell your neighbours"}
        </SlipHeading>
        <p className="pt-2 text-[14px] leading-relaxed">
          {lang === "hi"
            ? `${Math.round(pool.distanceKm)} किमी दूर ${mandiName} जाने वाले किसी भी किसान को इस समूह में जोड़ें। हर नए किसान के साथ सबका खर्च घटता है।`
            : `Anyone sending produce to ${mandiName} can join. Every farmer who does lowers the cost for everyone already in.`}
        </p>
        <p className="tnum mt-2 break-all rounded-[3px] bg-[var(--color-paper)] px-2 py-1.5 text-[12.5px] text-[var(--color-ink-2)]">
          /farmer/pool/{pool.id}
        </p>
      </Slip>

      <div className="space-y-2">
        {mine && <LeaveGroupButton poolId={pool.id} lang={lang} />}
        <Link
          href="/farmer/trips"
          className="block text-center text-[14px] underline decoration-dotted underline-offset-2 text-[var(--color-ink-2)]"
        >
          {t("back", lang)}
        </Link>
      </div>
    </Page>
  );
}
