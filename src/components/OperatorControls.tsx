"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t, type Lang } from "@/lib/i18n";

/** Accept or decline one pending load request. */
export function LoadDecision({
  loadId,
  lang,
}: {
  loadId: string;
  lang: Lang;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: "accept" | "reject") {
    setBusy(action);
    setError(null);

    const res = await fetch(`/api/loads/${loadId}/${action}`, {
      method: "POST",
    });

    setBusy(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not update this request.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => decide("accept")}
          disabled={busy !== null}
          className="flex-1 rounded-[3px] bg-[var(--color-keep)] px-3 font-display text-[15px] font-700 uppercase tracking-[0.06em] text-[var(--color-paper-2)] disabled:opacity-60"
        >
          {busy === "accept" ? "…" : t("accept", lang)}
        </button>
        <button
          type="button"
          onClick={() => decide("reject")}
          disabled={busy !== null}
          className="flex-1 rounded-[3px] border-2 border-[var(--color-lose)] px-3 font-display text-[15px] font-700 uppercase tracking-[0.06em] text-[var(--color-lose)] disabled:opacity-60"
        >
          {busy === "reject" ? "…" : t("reject", lang)}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-1 text-[13px] text-[var(--color-lose)]">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Trip lifecycle.
 *
 * "Start journey" also begins location reporting — on a real driver handset that is
 * the foreground service sending GPS; here it posts a ping from the browser so the
 * tracking path can be seen working end to end.
 */
export function TripControls({
  tripId,
  status,
  lang,
  className = "",
}: {
  tripId: string;
  status: string;
  lang: Lang;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function setStatus(next: "IN_TRANSIT" | "DELIVERED" | "CANCELLED") {
    setBusy(true);
    const res = await fetch(`/api/trips/${tripId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);

    if (res.ok) router.refresh();
    else setNote("Could not update the trip.");
  }

  async function ping() {
    setBusy(true);
    setNote(null);

    const send = async (lat?: number, lng?: number) => {
      const res = await fetch(`/api/trips/${tripId}/ping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lat != null ? { lat, lng } : {}),
      });
      setBusy(false);
      if (res.ok) {
        setNote(
          lang === "hi" ? "जगह भेज दी गई।" : "Location sent to the farmers.",
        );
        router.refresh();
      } else {
        setNote("Could not send the location.");
      }
    };

    // Use the real handset position when the driver allows it; otherwise the server
    // advances the truck along its route so the farmer still sees movement.
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => send(pos.coords.latitude, pos.coords.longitude),
        () => send(),
        { timeout: 5000 },
      );
    } else {
      send();
    }
  }

  if (status === "DELIVERED" || status === "CANCELLED") return null;

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        {status !== "IN_TRANSIT" ? (
          <button
            type="button"
            onClick={() => setStatus("IN_TRANSIT")}
            disabled={busy}
            className="flex-1 rounded-[3px] bg-[var(--color-keep)] px-3 font-display text-[15px] font-700 uppercase tracking-[0.06em] text-[var(--color-paper-2)] disabled:opacity-60"
          >
            {t("markInTransit", lang)}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={ping}
              disabled={busy}
              className="flex-1 rounded-[3px] border-2 border-[var(--color-keep)] px-3 font-display text-[15px] font-700 uppercase tracking-[0.06em] text-[var(--color-keep)] disabled:opacity-60"
            >
              {lang === "hi" ? "जगह भेजें" : "Send location"}
            </button>
            <button
              type="button"
              onClick={() => setStatus("DELIVERED")}
              disabled={busy}
              className="flex-1 rounded-[3px] bg-[var(--color-keep)] px-3 font-display text-[15px] font-700 uppercase tracking-[0.06em] text-[var(--color-paper-2)] disabled:opacity-60"
            >
              {t("markDelivered", lang)}
            </button>
          </>
        )}
      </div>

      {note && (
        <p className="mt-1 text-[12.5px] text-[var(--color-ink-2)]">{note}</p>
      )}
    </div>
  );
}
