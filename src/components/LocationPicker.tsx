"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";

export interface LocationOption {
  id: string;
  label: string;
  labelHi: string;
  village: string;
  district: string;
  state: string;
  lat: number;
  lng: number;
}

/**
 * Where the farmer is.
 *
 * Everything in this app is measured from here — which mandis are nearby, what
 * transport costs, which trucks are worth joining — so a farmer sitting in Sonipat
 * being told about Nashik prices would find the whole thing useless.
 *
 * The handset's own GPS is offered first and a short list of pilot locations second.
 * PRD §8 limits location to matching and logistics, so it is asked for at the point
 * it is used and the reason is stated on the button rather than buried in a policy.
 */
export function LocationPicker({
  lang,
  current,
  options,
}: {
  lang: Lang;
  current: { village: string | null; district: string | null; state: string | null };
  options: LocationOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const here = [current.village, current.district].filter(Boolean).join(", ");

  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);

    const res = await fetch("/api/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not save your location.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  function useGps() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError(
        lang === "hi"
          ? "इस फ़ोन से जगह नहीं ली जा सकी।"
          : "This device cannot share its location.",
      );
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        save({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        setBusy(false);
        setError(
          lang === "hi"
            ? "जगह नहीं मिल सकी। नीचे से चुन लें।"
            : "Could not read your location. Pick from the list instead.",
        );
      },
      { timeout: 8000 },
    );
  }

  return (
    <div className="mb-4 rounded-[3px] border border-[var(--color-rule)] bg-[var(--color-paper-2)] px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-display text-[10.5px] font-700 uppercase tracking-[0.16em] text-[var(--color-ink-3)]">
            {t("myLocation", lang)}
          </span>
          <span className="block truncate text-[15px]">
            {here || (lang === "hi" ? "तय नहीं" : "Not set")}
          </span>
        </span>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="shrink-0 rounded-[3px] border border-[var(--color-keep)] px-3 text-[13px] font-600 text-[var(--color-keep)]"
        >
          {t("changeLocation", lang)}
        </button>
      </div>

      {open && (
        <div className="mt-3 border-t border-dotted border-[var(--color-rule)] pt-3">
          <button
            type="button"
            onClick={useGps}
            disabled={busy}
            className="mb-2 w-full rounded-[3px] bg-[var(--color-keep)] px-3 font-display text-[14px] font-700 uppercase tracking-[0.06em] text-[var(--color-paper-2)] disabled:opacity-60"
          >
            {busy
              ? "…"
              : lang === "hi"
                ? "मेरी मौजूदा जगह लें"
                : "Use my current location"}
          </button>

          <div className="space-y-1.5">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={busy}
                onClick={() =>
                  save({
                    lat: o.lat,
                    lng: o.lng,
                    village: o.village,
                    district: o.district,
                    state: o.state,
                  })
                }
                className="w-full rounded-[3px] border border-[var(--color-rule)] bg-[var(--color-paper)] px-3 py-2 text-left text-[14px] disabled:opacity-60"
              >
                {lang === "hi" ? o.labelHi : o.label}
              </button>
            ))}
          </div>

          {error && (
            <p role="alert" className="mt-2 text-[13px] text-[var(--color-lose)]">
              {error}
            </p>
          )}

          <p className="mt-2 text-[11.5px] leading-snug text-[var(--color-ink-3)]">
            {lang === "hi"
              ? "आपकी जगह सिर्फ़ नज़दीकी मंडी और ढुलाई का हिसाब लगाने के काम आती है।"
              : "Your location is used only to find nearby mandis and work out transport cost."}
          </p>
        </div>
      )}
    </div>
  );
}
