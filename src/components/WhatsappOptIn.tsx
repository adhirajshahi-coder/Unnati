"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Slip, SlipHeading } from "@/components/Slip";
import { prefersHindi, type Lang } from "@/lib/i18n";

/**
 * Turning WhatsApp alerts on.
 *
 * Framed as a choice with its consequences stated, not a pre-ticked box. Meta requires
 * documented consent, and beyond that a farmer who did not understand what they agreed
 * to will block the number — which costs the channel for every other user on it.
 *
 * So the copy says exactly what will arrive, and the way out is on the same screen as
 * the way in rather than buried in a settings page nobody opens.
 */
export function WhatsappOptIn({
  lang,
  optedIn,
  phone,
  whatsappNumber,
  configured,
}: {
  lang: Lang;
  optedIn: boolean;
  phone: string;
  whatsappNumber: string | null;
  configured: boolean;
}) {
  const router = useRouter();
  const [on, setOn] = useState(optedIn);
  const [editing, setEditing] = useState(false);
  const [number, setNumber] = useState(whatsappNumber ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: boolean, num?: string) {
    setBusy(true);
    setError(null);

    const res = await fetch("/api/whatsapp/opt-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        optIn: next,
        ...(num !== undefined ? { whatsappNumber: num } : {}),
      }),
    });

    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(data.error ?? "Could not save that.");
      return;
    }

    setOn(next);
    setEditing(false);
    router.refresh();
  }

  const showing = whatsappNumber || phone;

  return (
    <Slip className="mb-5">
      <SlipHeading
        right={
          on ? (
            <span className="text-[var(--color-keep)]">
              {prefersHindi(lang) ? "चालू" : "On"}
            </span>
          ) : undefined
        }
      >
        {prefersHindi(lang) ? "व्हाट्सएप पर सूचनाएँ" : "Alerts on WhatsApp"}
      </SlipHeading>

      <p className="pt-2 text-[15px] leading-relaxed">
        {prefersHindi(lang)
          ? "मंडी भाव, आस-पास ट्रक साझा करने की ख़बर, और भुगतान की याद — सब सीधे व्हाट्सएप पर। ऐप खोलने की ज़रूरत नहीं, कमज़ोर नेटवर्क में भी पहुँच जाएगा।"
          : "Mandi prices, truck-sharing alerts near you, and payment reminders — sent straight to WhatsApp. No need to open the app, and they get through on a weak connection."}
      </p>

      <p className="tnum mt-2 text-[13px] text-[var(--color-ink-2)]">
        {prefersHindi(lang) ? "नंबर" : "Number"}: {showing}
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ml-2 min-h-0 underline decoration-dotted underline-offset-2 text-[var(--color-keep)]"
          >
            {prefersHindi(lang) ? "बदलें" : "Change"}
          </button>
        )}
      </p>

      {editing && (
        <div className="mt-2 flex gap-2">
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            inputMode="numeric"
            placeholder={phone}
            className="tnum min-w-0 flex-1 rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-3 text-[16px]"
          />
          <button
            type="button"
            onClick={() => save(on, number)}
            disabled={busy}
            className="shrink-0 rounded-[3px] border-2 border-[var(--color-keep)] px-4 text-[14px] font-600 text-[var(--color-keep)] disabled:opacity-60"
          >
            {prefersHindi(lang) ? "सहेजें" : "Save"}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[13px] text-[var(--color-lose)]">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => save(!on)}
        disabled={busy}
        className={`mt-3 w-full rounded-[3px] px-4 py-3 font-display text-[16px] font-700 uppercase tracking-[0.06em] disabled:opacity-60 ${
          on
            ? "border-2 border-[var(--color-rule-strong)] text-[var(--color-ink-2)]"
            : "bg-[var(--color-keep)] text-[var(--color-paper-2)]"
        }`}
      >
        {busy
          ? "…"
          : on
            ? prefersHindi(lang)
              ? "सूचनाएँ बंद करें"
              : "Turn alerts off"
            : prefersHindi(lang)
              ? "व्हाट्सएप पर सूचनाएँ चालू करें"
              : "Send my alerts to WhatsApp"}
      </button>

      <p className="mt-2 text-[11.5px] leading-snug text-[var(--color-ink-3)]">
        {prefersHindi(lang)
          ? "व्हाट्सएप पर कभी भी STOP लिखकर बंद कर सकते हैं। आपका नंबर सिर्फ़ इन्हीं सूचनाओं के लिए इस्तेमाल होता है।"
          : "Reply STOP on WhatsApp any time to turn these off. Your number is used for these alerts and nothing else."}
      </p>

      {!configured && (
        <p className="mt-2 rounded-[3px] border border-[var(--color-pool)] bg-[var(--color-pool-soft)] px-3 py-2 text-[12px] leading-snug text-[var(--color-pool)]">
          {prefersHindi(lang)
            ? "इस सर्वर पर व्हाट्सएप अभी जुड़ा नहीं है। आपकी पसंद सहेज ली जाएगी और जोड़ते ही सूचनाएँ जाने लगेंगी।"
            : "WhatsApp is not connected on this deployment yet. Your choice is saved, and alerts start flowing the moment it is."}
        </p>
      )}
    </Slip>
  );
}
