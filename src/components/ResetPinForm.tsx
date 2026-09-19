"use client";

/**
 * Resetting a farmer's PIN, from the ops desk.
 *
 * The new PIN is shown once and never again — it is not stored in readable form
 * anywhere, so leaving this screen loses it. The panel says so before the reset rather
 * than after, because an agent who has already navigated away has locked the farmer out
 * a second time and has to do it again.
 */
import { useState } from "react";
import { Slip, SlipHeading } from "@/components/Slip";

interface Result {
  pin: string;
  name: string;
  village: string | null;
  role: string;
}

export function ResetPinForm() {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/admin/reset-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json();

      if (!res.ok) setError(data.error ?? "Could not reset that PIN.");
      else {
        setResult(data);
        setPhone("");
      }
    } catch {
      setError("No network. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-5">
      <SlipHeading>Reset a PIN</SlipHeading>

      <Slip>
        <p className="text-[13.5px] leading-snug text-[var(--color-ink-2)]">
          For a farmer or operator who has forgotten theirs. Call them back on the
          registered number before resetting — this is the only check there is.
        </p>

        <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">Mobile number</span>
            <input
              id="reset-pin-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="numeric"
              placeholder="10-digit mobile number"
              className="tnum w-full min-w-0 rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-[16px]"
            />
          </label>
          <button
            type="submit"
            disabled={busy || phone.trim().length !== 10}
            className="shrink-0 rounded-[3px] border-2 border-[var(--color-keep)] px-4 py-2 font-display text-[14px] font-700 uppercase tracking-[0.06em] text-[var(--color-keep)] disabled:opacity-50"
          >
            {busy ? "…" : "Reset PIN"}
          </button>
        </form>

        {error && (
          <p
            role="alert"
            className="mt-2 text-[13.5px] text-[var(--color-lose)]"
          >
            {error}
          </p>
        )}

        {result && (
          <div className="mt-3 rounded-[3px] border-2 border-[var(--color-keep)] bg-[var(--color-keep-soft)] px-3 py-3">
            <div className="text-[13px] text-[var(--color-keep)]">
              {result.name}
              {result.village ? ` · ${result.village}` : ""} ·{" "}
              {result.role.toLowerCase()}
            </div>
            <div className="tnum mt-1 text-[38px] font-600 leading-none tracking-[0.18em] text-[var(--color-keep)]">
              {result.pin}
            </div>
            <p className="mt-2 text-[12.5px] leading-snug text-[var(--color-keep)]">
              Read this to them now. It is not stored anywhere and cannot be
              shown again — leave this page and you will have to reset it a
              second time.
            </p>
          </div>
        )}
      </Slip>
    </section>
  );
}
