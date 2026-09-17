"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { prefersHindi, t, type Lang } from "@/lib/i18n";

/**
 * Withdraw from a pooling group.
 *
 * Two taps rather than one. Leaving raises the cost for everyone still in the group,
 * so it should not happen by a mis-tap on a phone held in one hand — and the warning
 * says whose cost it affects, not just the farmer's own.
 */
export function LeaveGroupButton({
  poolId,
  lang,
}: {
  poolId: string;
  lang: Lang;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    setBusy(true);
    setError(null);

    const res = await fetch(`/api/pools/${poolId}/leave`, { method: "POST" });
    setBusy(false);

    if (!res.ok) {
      setError("Could not leave the group.");
      return;
    }
    router.push("/farmer/trips");
    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full rounded-[3px] border border-[var(--color-rule-strong)] px-4 py-2.5 text-[14px] text-[var(--color-ink-2)]"
      >
        {t("leaveGroup", lang)}
      </button>
    );
  }

  return (
    <div className="rounded-[3px] border border-[var(--color-lose)] bg-[var(--color-lose-soft)] p-3">
      <p className="text-[14px] leading-snug text-[var(--color-lose)]">
        {prefersHindi(lang)
          ? "समूह छोड़ने पर बाकी किसानों का खर्च बढ़ जाएगा। पक्का?"
          : "Leaving raises the cost for everyone still in the group. Sure?"}
      </p>

      {error && (
        <p role="alert" className="mt-1 text-[13px] text-[var(--color-lose)]">
          {error}
        </p>
      )}

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="flex-[2] rounded-[3px] bg-[var(--color-keep)] px-3 py-2 font-display text-[14px] font-700 uppercase tracking-[0.06em] text-[var(--color-paper-2)]"
        >
          {prefersHindi(lang) ? "समूह में रहें" : "Stay in"}
        </button>
        <button
          type="button"
          onClick={leave}
          disabled={busy}
          className="flex-1 rounded-[3px] border border-[var(--color-lose)] px-3 py-2 text-[14px] text-[var(--color-lose)] disabled:opacity-60"
        >
          {busy ? "…" : t("leaveGroup", lang)}
        </button>
      </div>
    </div>
  );
}
