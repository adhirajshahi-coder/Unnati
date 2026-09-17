"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { prefersHindi, rupees, t, type Lang } from "@/lib/i18n";

/**
 * UPI settlement.
 *
 * A real deployment hands off to a payment gateway here (PDD §5 names Razorpay/PayU)
 * and returns on the callback. This records the payment directly and labels itself as
 * a demo, because pretending to charge money is worse than saying plainly that it
 * does not — and PRD §12 lists trust in the cost-split as a headline risk.
 */
export function PayButton({
  transactionId,
  lang,
  amount,
}: {
  transactionId: string;
  lang: Lang;
  amount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);

    const res = await fetch(`/api/transactions/${transactionId}/pay`, {
      method: "POST",
    });

    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Payment could not be recorded.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className="w-full rounded-[3px] bg-[var(--color-keep)] px-4 font-display text-[16px] font-700 uppercase tracking-[0.06em] text-[var(--color-paper-2)] disabled:opacity-60"
      >
        {busy ? "…" : `${t("payNow", lang)} · ${rupees(amount)}`}
      </button>

      {error && (
        <p role="alert" className="mt-1 text-[13px] text-[var(--color-lose)]">
          {error}
        </p>
      )}

      <p className="mt-1 text-center text-[11.5px] text-[var(--color-ink-3)]">
        {prefersHindi(lang)
          ? "डेमो: असली UPI भुगतान नहीं होगा।"
          : "Demo only — no real UPI payment is made."}
      </p>
    </div>
  );
}
