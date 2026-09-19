"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Slip, SlipHeading } from "@/components/Slip";
import { prefersHindi, t, type Lang } from "@/lib/i18n";

interface ListingOption {
  id: string;
  cropId: string;
  label: string;
  quantityKg: number;
  grade: "A" | "B" | "C";
  pickupName: string;
  pickupLat: number;
  pickupLng: number;
}

/**
 * Request a place on a truck.
 *
 * If the farmer already has a harvest listed, joining is one tap on that listing — the
 * crop, weight and pickup point are known, and asking for them again would be asking
 * someone to retype what the app already has.
 */
export function JoinButton({
  tripId,
  lang,
  disabled,
  defaultQuantityKg,
  maxKg,
  listings,
  crops,
  fallbackPickup,
}: {
  tripId: string;
  lang: Lang;
  disabled: boolean;
  defaultQuantityKg: number;
  maxKg: number;
  listings: ListingOption[];
  crops: Array<{ id: string; label: string }>;
  fallbackPickup: { name: string; lat: number; lng: number };
}) {
  const router = useRouter();
  const [listingId, setListingId] = useState<string | null>(
    listings[0]?.id ?? null,
  );
  const [cropId, setCropId] = useState(crops[0]?.id ?? "");
  const [quintals, setQuintals] = useState(String(defaultQuantityKg / 100));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = listings.find((l) => l.id === listingId);

  async function submit() {
    setBusy(true);
    setError(null);

    const body = chosen
      ? {
          tripId,
          listingId: chosen.id,
          cropId: chosen.cropId,
          quantityKg: chosen.quantityKg,
          grade: chosen.grade,
          pickupName: chosen.pickupName,
          pickupLat: chosen.pickupLat,
          pickupLng: chosen.pickupLng,
        }
      : {
          tripId,
          cropId,
          quantityKg: Math.round(Number(quintals) * 100),
          grade: "B",
          pickupName: fallbackPickup.name,
          pickupLat: fallbackPickup.lat,
          pickupLng: fallbackPickup.lng,
        };

    const res = await fetch("/api/loads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(data.error ?? "Could not join this truck.");
      return;
    }
    router.push(`/farmer/trip/${tripId}`);
    router.refresh();
  }

  if (disabled) {
    return (
      <p className="rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper-2)] px-4 py-4 text-center text-[15px] text-[var(--color-ink-2)]">
        {prefersHindi(lang)
          ? "यह ट्रक अब और लोड नहीं ले सकता।"
          : "This truck is no longer accepting loads."}
      </p>
    );
  }

  return (
    <Slip lifted>
      <SlipHeading>
        {prefersHindi(lang) ? "क्या भेजना है?" : "What are you sending?"}
      </SlipHeading>

      <div className="space-y-2 pt-2">
        {listings.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setListingId(l.id)}
            aria-pressed={listingId === l.id}
            className={`flex w-full items-center justify-between rounded-[3px] border px-3 py-2 text-left text-[15px] ${
              listingId === l.id
                ? "border-[var(--color-keep)] bg-[var(--color-keep)] font-600 text-[var(--color-paper-2)]"
                : "border-[var(--color-rule)] bg-[var(--color-paper)]"
            }`}
          >
            <span>{l.label}</span>
            <span className="text-[12px] opacity-80">{l.pickupName}</span>
          </button>
        ))}

        <button
          type="button"
          onClick={() => setListingId(null)}
          aria-pressed={listingId === null}
          className={`w-full rounded-[3px] border px-3 py-2 text-left text-[15px] ${
            listingId === null
              ? "border-[var(--color-keep)] bg-[var(--color-keep)] font-600 text-[var(--color-paper-2)]"
              : "border-[var(--color-rule)] bg-[var(--color-paper)]"
          }`}
        >
          {prefersHindi(lang) ? "कुछ और भेजना है" : "Something else"}
        </button>

        {listingId === null && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <label className="block">
              <span className="mb-1 block text-[12.5px] text-[var(--color-ink-2)]">
                {t("crop", lang)}
              </span>
              <select
                value={cropId}
                onChange={(e) => setCropId(e.target.value)}
                className="w-full rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-2 text-[15px]"
              >
                {crops.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12.5px] text-[var(--color-ink-2)]">
                {t("quantity", lang)} ({t("quintal", lang)})
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="0.5"
                max={maxKg / 100}
                // Whole numbers happened to be valid here, but a half-quintal step
                // still refused 2.3 — and a weighbridge does not round.
                step="any"
                value={quintals}
                onChange={(e) => setQuintals(e.target.value)}
                className="tnum w-full rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-2 text-[17px] font-600"
              />
            </label>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-[3px] border border-[var(--color-lose)] bg-[var(--color-lose-soft)] px-3 py-2 text-[14px] text-[var(--color-lose)]"
          >
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="w-full rounded-[3px] bg-[var(--color-pool)] px-4 font-display text-[17px] font-700 uppercase tracking-[0.06em] text-[var(--color-paper-2)] disabled:opacity-60"
        >
          {busy ? "…" : t("joinTruck", lang)}
        </button>

        <p className="text-center text-[12px] leading-snug text-[var(--color-ink-3)]">
          {prefersHindi(lang)
            ? "ट्रक मालिक की मंज़ूरी के बाद ही जगह पक्की होगी। भुगतान डिलीवरी के 14 दिन बाद, याद 7 दिन पहले।"
            : "Your place is confirmed once the truck owner accepts. Payment is due 14 days after delivery, with a reminder 7 days before."}
        </p>
      </div>
    </Slip>
  );
}
