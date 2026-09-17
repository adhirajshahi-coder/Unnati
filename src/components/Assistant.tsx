"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Slip } from "@/components/Slip";
import { SpeakButton } from "@/components/SpeakButton";
import { prefersHindi, t, type Lang } from "@/lib/i18n";

interface Reply {
  text: string;
  link?: { href: string; label: string };
  facts?: Array<{ label: string; value: string }>;
  suggestions?: string[];
  rephrased?: boolean;
}

interface Turn {
  from: "farmer" | "unnati";
  text: string;
  reply?: Reply;
}

/** The answer and its figures as one passage, so the listener hears the whole reply. */
function spokenReply(turn: Turn): string {
  const parts = [turn.text];
  for (const fact of turn.reply?.facts ?? []) {
    parts.push(`${fact.label}: ${fact.value}.`);
  }
  return parts.join(" ");
}

/**
 * Instant help.
 *
 * Answers are built from the app's own data — the same queries and the same decision
 * engine that draw every other screen — so a figure quoted here is a figure the farmer
 * can go and check. A language model, where one is configured, reads the question and
 * rewrites the wording; it is never the source of a number, and any rewrite that
 * alters one is discarded server-side.
 *
 * Suggested questions are offered rather than an empty box, because a blank prompt is
 * the hardest thing to answer for anyone unsure what a machine will understand.
 */
export function Assistant({
  lang,
  starters,
}: {
  lang: Lang;
  starters: string[];
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;

    setTurns((prev) => [...prev, { from: "farmer", text: q }]);
    setDraft("");
    setBusy(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();

      setTurns((prev) => [
        ...prev,
        res.ok
          ? { from: "unnati", text: data.text, reply: data }
          : {
              from: "unnati",
              text:
                data.error ??
                (prefersHindi(lang)
                  ? "अभी जवाब नहीं दे पाया। थोड़ी देर में फिर पूछें।"
                  : "I could not answer that just now. Try again shortly."),
            },
      ]);
    } catch {
      setTurns((prev) => [
        ...prev,
        {
          from: "unnati",
          text:
            prefersHindi(lang)
              ? "नेटवर्क नहीं मिला। दोबारा कोशिश करें।"
              : "No network. Try again.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  const latest = turns.filter((x) => x.from === "unnati").at(-1)?.reply;
  const chips = turns.length === 0 ? starters : (latest?.suggestions ?? []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3">
        {turns.length === 0 && (
          <Slip>
            <p className="text-[15px] leading-relaxed">
              {prefersHindi(lang)
                ? "भाव, कहाँ बेचना है, ट्रक साझा करना, आपका हिसाब या फ़सल की देखभाल — जो पूछना हो हिंदी या अंग्रेज़ी में पूछिए।"
                : "Ask about prices, where to sell, sharing a truck, your ledger, or how to handle a crop — in Hindi or English, whichever is easier."}
            </p>
            <p className="mt-2 text-[12.5px] leading-snug text-[var(--color-ink-3)]">
              {prefersHindi(lang)
                ? "हर आँकड़ा ऐप के अपने हिसाब से आता है — अंदाज़े से कोई भाव नहीं बताया जाता।"
                : "Every figure comes from the app's own data. Nothing here is estimated in prose."}
            </p>
          </Slip>
        )}

        {turns.map((turn, i) =>
          turn.from === "farmer" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] rounded-[3px] bg-[var(--color-keep)] px-3 py-2 text-[15px] leading-snug text-[var(--color-paper-2)]">
                {turn.text}
              </p>
            </div>
          ) : (
            <div key={i}>
              <Slip>
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-[15px] leading-relaxed">
                    {turn.text}
                  </p>
                  {/*
                    An answer is the one place in the app where the farmer asked a
                    question in their own words, so it is the place they are most
                    likely to want spoken back. The facts below are read too — they
                    carry the figure the answer is about.
                  */}
                  <SpeakButton
                    lang={lang}
                    text={spokenReply(turn)}
                    size="sm"
                    label={null}
                  />
                </div>

                {turn.reply?.facts && turn.reply.facts.length > 0 && (
                  <ul className="mt-2 border-t border-dotted border-[var(--color-rule)] pt-1">
                    {turn.reply.facts.map((f, j) => (
                      <li
                        key={j}
                        className="flex items-baseline justify-between gap-3 border-b border-dotted border-[var(--color-rule)] py-1.5 last:border-0"
                      >
                        <span className="min-w-0 truncate text-[13.5px]">
                          {f.label}
                        </span>
                        <span className="tnum shrink-0 text-[14px] font-600">
                          {f.value}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {turn.reply?.link && (
                  <Link
                    href={turn.reply.link.href}
                    className="mt-3 flex items-center justify-center rounded-[3px] border-2 border-[var(--color-keep)] px-4 py-2 font-display text-[14px] font-700 uppercase tracking-[0.06em] text-[var(--color-keep)]"
                  >
                    {turn.reply.link.label}
                  </Link>
                )}
              </Slip>
            </div>
          ),
        )}

        {busy && (
          <p className="text-[14px] text-[var(--color-ink-3)]">
            {prefersHindi(lang) ? "देख रहा हूँ…" : "Looking that up…"}
          </p>
        )}

        <div ref={endRef} />
      </div>

      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {chips.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              disabled={busy}
              className="rounded-[3px] border border-dashed border-[var(--color-pool)] px-3 py-2 text-left text-[13.5px] text-[var(--color-pool)] disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="sticky bottom-0 mt-3 flex gap-2 bg-[var(--color-paper)] pt-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={
            prefersHindi(lang) ? "अपना सवाल लिखें…" : "Type your question…"
          }
          className="min-w-0 flex-1 rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper-2)] px-3 text-[16px] outline-none focus:border-[var(--color-keep)]"
        />
        <button
          type="submit"
          disabled={busy || draft.trim().length === 0}
          className="shrink-0 rounded-[3px] bg-[var(--color-keep)] px-4 font-display text-[15px] font-700 uppercase tracking-[0.06em] text-[var(--color-paper-2)] disabled:opacity-50"
        >
          {t("askQuestion", lang)}
        </button>
      </form>
    </div>
  );
}
