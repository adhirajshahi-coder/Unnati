"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Slip, SlipHeading } from "@/components/Slip";

/**
 * Setting a new PIN from an emailed link.
 *
 * The token never leaves the query string for anywhere but the request body — it is not
 * stored, and the server marks it used the moment it works, so a link found later in a
 * browser history or a forwarded email is already spent.
 *
 * A missing token is its own screen rather than a form that will certainly fail. The
 * usual cause is an email client that broke the URL across two lines, which is worth
 * saying, because the reader's next move is to open it differently rather than to ask
 * for another link.
 */
export function ResetByLink() {
  const token = useSearchParams().get("token") ?? "";
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <Slip>
        <SlipHeading>लिंक अधूरा है</SlipHeading>
        <p className="pt-2 text-[15px] leading-relaxed">
          इस पते में कोड नहीं है। अक्सर ऐसा तब होता है जब ईमेल ने लिंक को दो लाइनों
          में तोड़ दिया हो — पूरा पता कॉपी करके दोबारा खोलिए, या नया लिंक माँगिए।
        </p>
        <p className="mt-2 text-[13px] text-[var(--color-ink-3)]">
          This address has no code in it. Copy the whole link, or ask for a new one.
        </p>
        <Link
          href="/"
          className="mt-3 flex items-center justify-center rounded-[3px] border-2 border-[var(--color-keep)] px-4 py-2 font-display text-[15px] font-700 uppercase tracking-[0.06em] text-[var(--color-keep)]"
        >
          लॉग इन पर जाएँ
        </Link>
      </Slip>
    );
  }

  const ready = /^\d{4}$/.test(pin) && pin === again;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/pin-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "token", token, newPin: pin }),
      });
      const data = await res.json();
      if (res.ok) setDone(true);
      else setError(data.errorHi ?? data.error ?? "कुछ गड़बड़ हुई।");
    } catch {
      setError("नेटवर्क नहीं मिला। दोबारा कोशिश कीजिए।");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Slip lifted>
        <SlipHeading>पिन बदल गया</SlipHeading>
        <p className="pt-2 text-[15px] leading-relaxed">
          अब नए पिन से लॉग इन कीजिए। यह लिंक दोबारा नहीं चलेगा।
        </p>
        <Link
          href="/"
          className="mt-3 flex items-center justify-center rounded-[3px] bg-[var(--color-keep)] px-4 py-3 font-display text-[16px] font-700 uppercase tracking-[0.06em] text-[var(--color-paper-2)]"
        >
          लॉग इन · Sign in
        </Link>
      </Slip>
    );
  }

  return (
    <Slip lifted>
      <SlipHeading>नया पिन</SlipHeading>

      <form onSubmit={submit} className="space-y-3 pt-2">
        <label className="block">
          <span className="mb-1 block text-[13px] font-500 text-[var(--color-ink-2)]">
            नया 4 अंकों का पिन
          </span>
          <input
            id="reset-new-pin"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            inputMode="numeric"
            type="password"
            maxLength={4}
            autoComplete="new-password"
            className="tnum w-full rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-[17px] outline-none focus:border-[var(--color-keep)]"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[13px] font-500 text-[var(--color-ink-2)]">
            दोबारा डालिए
          </span>
          <input
            id="reset-new-pin-again"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            inputMode="numeric"
            type="password"
            maxLength={4}
            autoComplete="new-password"
            className="tnum w-full rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-[17px] outline-none focus:border-[var(--color-keep)]"
          />
        </label>

        {again.length === 4 && pin !== again && (
          <p className="text-[13.5px] text-[var(--color-lose)]">
            दोनों पिन एक जैसे नहीं हैं।
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-[3px] border border-[var(--color-lose)] bg-[var(--color-lose-soft)] px-3 py-2 text-[14px] leading-snug text-[var(--color-lose)]"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!ready || busy}
          className="w-full rounded-[3px] bg-[var(--color-keep)] px-4 py-3 font-display text-[16px] font-700 uppercase tracking-[0.06em] text-[var(--color-paper-2)] disabled:opacity-60"
        >
          {busy ? "…" : "पिन बदलें"}
        </button>
      </form>
    </Slip>
  );
}
