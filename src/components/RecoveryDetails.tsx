"use client";

/**
 * Where a farmer sets what will let them back in later.
 *
 * Both fields are optional and the panel says what each one buys, because a farmer
 * being asked for a birth date has every reason to wonder why an app that sells
 * vegetables wants it. The answer — "so you can get back in without finding a field
 * agent" — is the only reason it is here.
 *
 * It is also honest about the cost. A birth date is something a neighbour knows, and
 * anyone who has it can take the account; that is said plainly next to the field rather
 * than buried, so the choice to fill it in is an informed one.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Slip, SlipHeading } from "@/components/Slip";
import { prefersHindi, type Lang } from "@/lib/i18n";

export function RecoveryDetails({
  lang,
  dateOfBirth,
  email,
}: {
  lang: Lang;
  dateOfBirth: string | null;
  email: string | null;
}) {
  const router = useRouter();
  const hi = prefersHindi(lang);

  const [dob, setDob] = useState(dateOfBirth ?? "");
  const [mail, setMail] = useState(email ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);

    try {
      const res = await fetch("/api/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateOfBirth: dob.trim(), email: mail.trim() }),
      });
      const data = await res.json();

      if (!res.ok) setError(hi ? (data.errorHi ?? data.error) : data.error);
      else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError(hi ? "नेटवर्क नहीं मिला।" : "No network.");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 py-2 text-[16px] outline-none focus:border-[var(--color-keep)]";

  return (
    <Slip className="mb-5">
      <SlipHeading>
        {hi ? "पिन भूल जाएँ तो" : "If you forget your PIN"}
      </SlipHeading>

      <p className="pt-2 text-[14px] leading-snug text-[var(--color-ink-2)]">
        {hi
          ? "ये दोनों वैकल्पिक हैं। भरे होंगे तो पिन भूलने पर आप ख़ुद नया बना सकेंगे — किसी को ढूँढना नहीं पड़ेगा।"
          : "Both optional. With either one filled in you can set a new PIN yourself instead of finding someone to do it."}
      </p>

      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="mb-1 block text-[13px] font-500 text-[var(--color-ink-2)]">
            {hi ? "जन्मतिथि" : "Date of birth"}
          </span>
          <input
            id="recovery-dob"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            inputMode="numeric"
            placeholder="05/08/1974"
            className={`tnum ${input}`}
          />
          <span className="mt-1 block text-[12px] leading-snug text-[var(--color-ink-3)]">
            {hi
              ? "ध्यान रहे: जन्मतिथि कोई गुप्त बात नहीं होती। जो इसे जानता है वह आपका पिन बदल सकता है — इसलिए पिन बदलते ही आपको सूचना भेज दी जाती है।"
              : "Be aware: a birth date is not a secret. Anyone who knows it can change your PIN, so you are alerted the moment one is changed."}
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-[13px] font-500 text-[var(--color-ink-2)]">
            {hi ? "ईमेल — अगर हो" : "Email — if you have one"}
          </span>
          <input
            id="recovery-email"
            value={mail}
            onChange={(e) => setMail(e.target.value)}
            type="email"
            autoComplete="email"
            placeholder="naam@example.com"
            className={input}
          />
          <span className="mt-1 block text-[12px] leading-snug text-[var(--color-ink-3)]">
            {hi
              ? "ईमेल वाला रास्ता ज़्यादा सुरक्षित है। खाली छोड़ सकते हैं।"
              : "The email route is the safer of the two. Leave it blank if you have none."}
          </span>
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[13.5px] text-[var(--color-lose)]">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="mt-2 text-[13.5px] text-[var(--color-keep)]">
          {hi ? "सहेज लिया गया।" : "Saved."}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="mt-3 w-full rounded-[3px] border-2 border-[var(--color-keep)] px-4 py-2.5 font-display text-[15px] font-700 uppercase tracking-[0.06em] text-[var(--color-keep)] disabled:opacity-60"
      >
        {busy ? "…" : hi ? "सहेजें" : "Save"}
      </button>
    </Slip>
  );
}
