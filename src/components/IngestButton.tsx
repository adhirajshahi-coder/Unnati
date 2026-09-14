"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Summary {
  inserted: number;
  marketsQueried: number;
  marketsWithData: number;
  recordsSeen: number;
  rejectedOutOfRange: number;
  skippedUnknownCommodity: number;
  errors: string[];
}

/**
 * Pull live prices now.
 *
 * The result is reported in full, including what was thrown away. An ingest that
 * silently drops a fifth of its rows looks identical to one that worked, and whoever
 * runs the pilot needs to see the difference — the rejected count is the sanity
 * bounds catching bad government data, and a sudden spike in it means the feed has
 * changed shape.
 */
export function IngestButton({ hasKey }: { hasKey: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/admin/ingest", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "The ingest failed.");
      } else {
        setResult(data);
        router.refresh();
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={run}
        disabled={busy || !hasKey}
        className="w-full rounded-[3px] bg-[var(--color-keep)] px-4 font-display text-[15px] font-700 uppercase tracking-[0.06em] text-[var(--color-paper-2)] disabled:opacity-50"
      >
        {busy ? "Pulling from Agmarknet…" : "Refresh live prices"}
      </button>

      {!hasKey && (
        <p className="mt-1.5 text-[12.5px] leading-snug text-[var(--color-ink-2)]">
          Set <code className="tnum">DATA_GOV_API_KEY</code> to enable the live
          feed. A free key takes a minute at data.gov.in. Until then the app serves
          its shipped baseline prices and labels them as such.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-2 rounded-[3px] border border-[var(--color-lose)] bg-[var(--color-lose-soft)] px-3 py-2 text-[13px] text-[var(--color-lose)]"
        >
          {error}
        </p>
      )}

      {result && (
        <div className="mt-2 rounded-[3px] bg-[var(--color-keep-soft)] px-3 py-2 text-[13px] text-[var(--color-keep)]">
          <p className="font-600">
            {result.inserted} prices stored from {result.marketsWithData} of{" "}
            {result.marketsQueried} markets.
          </p>
          <p className="tnum mt-0.5 text-[12px] opacity-90">
            {result.recordsSeen} feed rows seen ·{" "}
            {result.rejectedOutOfRange} rejected as out of range ·{" "}
            {result.skippedUnknownCommodity} for crops not carried
          </p>
          {result.errors.length > 0 && (
            <p className="mt-1 text-[12px] text-[var(--color-lose)]">
              {result.errors.length} market(s) errored: {result.errors[0]}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
