"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Slip, SlipHeading } from "@/components/Slip";
import { rupees, t, weight, type Lang } from "@/lib/i18n";
import type { SharedOffer } from "@/components/Recommendations";

/**
 * How the produce actually gets to the mandi.
 *
 * Two options, always both shown, always priced against each other. Previously a
 * farmer was offered a shared truck only when an operator happened to have opened a
 * run to that mandi; otherwise the only button said "hire full truck". For a
 * smallholder with ten quintal that is not a choice, it is a dead end — and it is the
 * exact situation the product exists to fix.
 *
 * So the shared option is offered unconditionally. If neighbours are already
 * gathering, the farmer joins them. If not, they start the group and the app tells
 * nearby farmers. The price shown is what they pay at the group's realistic size, not
 * at a full truck — a number the group might never reach is not a price, it is bait.
 */
export function TransportChoice({
  lang,
  mandiId,
  mandiName,
  distanceKm,
  quantityKg,
  cropId,
  grade,
  origin,
  departAt,
  soloTransport,
  alreadyPooled,
  pooledTripId,
  shared,
}: {
  lang: Lang;
  mandiId: string;
  mandiName: string;
  distanceKm: number;
  quantityKg: number;
  cropId: string;
  grade: "A" | "B" | "C";
  origin: { name: string; lat: number; lng: number };
  departAt: string;
  soloTransport: number;
  alreadyPooled: boolean;
  pooledTripId?: string;
  shared: SharedOffer;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A truck is already running there and has room — nothing to organise.
  if (alreadyPooled && pooledTripId) {
    return (
      <Slip lifted>
        <SlipHeading>{t("sharedTruck", lang)}</SlipHeading>
        <p className="pt-2 text-[15px] leading-relaxed">
          {lang === "hi"
            ? `${mandiName} के लिए एक ट्रक पहले से जा रहा है और उसमें जगह है।`
            : `A truck is already running to ${mandiName} and has room for your load.`}
        </p>
        <a
          href={`/farmer/join/${pooledTripId}?qty=${quantityKg}`}
          role="button"
          className="mt-3 flex items-center justify-center rounded-[3px] bg-[var(--color-pool)] px-4 py-3 font-display text-[16px] font-700 uppercase tracking-[0.06em] text-[var(--color-paper-2)]"
        >
          {t("joinTruck", lang)} · {rupees(soloTransport)}
        </a>
      </Slip>
    );
  }

  const joiningExisting = Boolean(shared.poolId);

  async function share() {
    setBusy(true);
    setError(null);

    const res = await fetch("/api/pools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        poolId: shared.poolId,
        mandiId,
        cropId,
        quantityKg,
        grade,
        pickupName: origin.name,
        pickupLat: origin.lat,
        pickupLng: origin.lng,
        departAt,
      }),
    });

    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(data.error ?? "Could not join a group.");
      return;
    }
    router.push(`/farmer/pool/${data.poolId}`);
    router.refresh();
  }

  return (
    <Slip lifted>
      <SlipHeading right={`${distanceKm} km`}>
        {lang === "hi" ? "ढुलाई कैसे करें" : "How to get it there"}
      </SlipHeading>

      <div className="mt-2 space-y-3">
        {/* The shared option leads, because it is the cheaper one and the one a
            smallholder can actually afford. */}
        <div className="rounded-[3px] border-2 border-[var(--color-pool)] bg-[var(--color-pool-soft)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-display text-[11px] font-700 uppercase tracking-[0.16em] text-[var(--color-pool)]">
                {t("shareOption", lang)}
              </div>
              <div className="text-[14px] leading-snug text-[var(--color-ink-2)]">
                {joiningExisting
                  ? lang === "hi"
                    ? `${shared.memberCount} किसान पहले से जुड़े हैं — ${weight(shared.committedKg, lang)} तैयार`
                    : `${shared.memberCount} farmers already in — ${weight(shared.committedKg, lang)} gathered`
                  : lang === "hi"
                    ? `${shared.vehicle} में पड़ोसियों के साथ जगह बाँटें`
                    : `Split a ${shared.vehicle} with neighbours going the same way`}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="tnum text-[24px] font-600 leading-none text-[var(--color-pool)]">
                {rupees(shared.cost)}
              </div>
              {shared.savedPercent > 0 && (
                <div className="tnum text-[11.5px] text-[var(--color-keep)]">
                  −{shared.savedPercent}%
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 border-t border-dotted border-[var(--color-pool)] pt-2">
            <Row
              label={t("yourCostNow", lang)}
              value={rupees(shared.cost)}
              sub={
                joiningExisting
                  ? lang === "hi"
                    ? "अभी जितने किसान जुड़े हैं"
                    : "at the group's current size"
                  : lang === "hi"
                    ? `${weight(shared.targetKg, lang)} के समूह पर`
                    : `assuming a ${weight(shared.targetKg, lang)} group`
              }
            />
            <Row
              label={t("yourCostFull", lang)}
              value={rupees(shared.costIfFull)}
              tone="keep"
            />
            <Row
              label={t("aloneYouPay", lang)}
              value={rupees(shared.soloCost)}
              tone="lose"
            />
          </div>

          <button
            type="button"
            onClick={share}
            disabled={busy}
            className="mt-3 w-full rounded-[3px] bg-[var(--color-pool)] px-4 py-3 font-display text-[16px] font-700 uppercase tracking-[0.06em] text-[var(--color-paper-2)] disabled:opacity-60"
          >
            {busy
              ? "…"
              : joiningExisting
                ? t("joinGroup", lang)
                : t("startGroup", lang)}
          </button>

          <p className="mt-1.5 text-center text-[11.5px] leading-snug text-[var(--color-ink-2)]">
            {t("inviteNeighbours", lang)}
          </p>
        </div>

        {/* The full truck stays available and honestly priced — a farmer with a big
            load or an urgent dispatch is right to take it. */}
        <div className="rounded-[3px] border border-[var(--color-rule-strong)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-display text-[11px] font-700 uppercase tracking-[0.16em] text-[var(--color-ink-3)]">
                {t("fullTruckOption", lang)}
              </div>
              <div className="text-[13.5px] leading-snug text-[var(--color-ink-2)]">
                {lang === "hi"
                  ? "तुरंत निकल सकते हैं, किसी का इंतज़ार नहीं"
                  : "Leave when you like, no waiting for anyone"}
              </div>
            </div>
            <div className="tnum shrink-0 text-[20px] font-600">
              {rupees(shared.soloCost)}
            </div>
          </div>

          <a
            href={`/farmer/trips?mandi=${mandiId}`}
            role="button"
            className="mt-3 flex items-center justify-center rounded-[3px] border-2 border-[var(--color-keep)] px-4 py-2.5 font-display text-[15px] font-700 uppercase tracking-[0.06em] text-[var(--color-keep)]"
          >
            {t("ownTruck", lang)}
          </a>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-2 rounded-[3px] border border-[var(--color-lose)] bg-[var(--color-lose-soft)] px-3 py-2 text-[13.5px] text-[var(--color-lose)]"
        >
          {error}
        </p>
      )}
    </Slip>
  );
}

function Row({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "keep" | "lose";
}) {
  const color = {
    neutral: "text-ink",
    keep: "text-[var(--color-keep)]",
    lose: "text-[var(--color-lose)]",
  }[tone];

  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="min-w-0">
        <span className="block text-[13.5px]">{label}</span>
        {sub && (
          <span className="block text-[11.5px] leading-tight text-[var(--color-ink-3)]">
            {sub}
          </span>
        )}
      </span>
      <span className={`tnum shrink-0 text-[14px] font-600 ${color}`}>
        {value}
      </span>
    </div>
  );
}
