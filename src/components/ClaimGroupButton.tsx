"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { rupees, t, weight, type Lang } from "@/lib/i18n";

export interface TruckOption {
  id: string;
  label: string;
  capacityKg: number;
}

/**
 * An operator takes a waiting group.
 *
 * Only trucks that can actually carry the whole group are offered — a group is an
 * all-or-nothing commitment to a set of farmers, and letting an operator pick a truck
 * that fits two thirds of it would mean telling the rest their booking fell through.
 */
export function ClaimGroupButton({
  poolId,
  lang,
  trucks,
  committedKg,
  estimatedRevenue,
}: {
  poolId: string;
  lang: Lang;
  trucks: TruckOption[];
  committedKg: number;
  estimatedRevenue: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [truckId, setTruckId] = useState(trucks[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fits = trucks.filter((t) => t.capacityKg >= committedKg);

  async function claim() {
    setBusy(true);
    setError(null);

    const res = await fetch(`/api/pools/${poolId}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ truckId }),
    });

    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(data.error ?? "Could not take this group.");
      return;
    }
    router.push(`/operator/trip/${data.tripId}`);
    router.refresh();
  }

  if (fits.length === 0) {
    return (
      <p className="mt-3 rounded-[3px] border border-[var(--color-rule-strong)] px-3 py-2 text-[13px] text-[var(--color-ink-2)]">
        {lang === "hi"
          ? `इस समूह के लिए ${weight(committedKg, lang)} ढोने वाला ट्रक चाहिए। आपके पास उतना बड़ा ट्रक दर्ज नहीं है।`
          : `This group needs a truck carrying ${weight(committedKg, lang)}. None of your registered trucks is that big.`}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTruckId(fits[0].id);
        }}
        className="mt-3 w-full rounded-[3px] bg-[var(--color-keep)] px-4 py-2.5 font-display text-[15px] font-700 uppercase tracking-[0.06em] text-[var(--color-paper-2)]"
      >
        {t("claimGroup", lang)} · {rupees(estimatedRevenue)}
      </button>
    );
  }

  return (
    <div className="mt-3 border-t-2 border-[var(--color-ink)] pt-3">
      <label className="block">
        <span className="mb-1 block text-[13px] font-500 text-[var(--color-ink-2)]">
          {lang === "hi" ? "कौन सा ट्रक भेजेंगे" : "Which truck will carry it"}
        </span>
        <select
          value={truckId}
          onChange={(e) => setTruckId(e.target.value)}
          className="w-full rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-2 text-[15px]"
        >
          {fits.map((tr) => (
            <option key={tr.id} value={tr.id}>
              {tr.label}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p role="alert" className="mt-2 text-[13px] text-[var(--color-lose)]">
          {error}
        </p>
      )}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 rounded-[3px] border border-[var(--color-rule-strong)] px-3 py-2 text-[14px]"
        >
          {t("cancel", lang)}
        </button>
        <button
          type="button"
          onClick={claim}
          disabled={busy}
          className="flex-[2] rounded-[3px] bg-[var(--color-keep)] px-3 py-2 font-display text-[15px] font-700 uppercase tracking-[0.06em] text-[var(--color-paper-2)] disabled:opacity-60"
        >
          {busy ? "…" : t("claimGroup", lang)}
        </button>
      </div>

      <p className="mt-1.5 text-center text-[11.5px] leading-snug text-[var(--color-ink-3)]">
        {lang === "hi"
          ? "हर किसान का लोड पक्का हो जाएगा और खर्च वज़न के हिसाब से बँट जाएगा।"
          : "Every farmer's load is confirmed and the cost splits by weight, as on any other trip."}
      </p>
    </div>
  );
}
