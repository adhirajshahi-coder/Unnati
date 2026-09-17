"use client";

/**
 * Read this aloud.
 *
 * For a farmer who cannot read the screen, this is not an accessibility nicety bolted
 * on at the end — it is the primary way the recommendation gets from the app into their
 * head. Everything about the control follows from that:
 *
 *   - It is a real button at thumb size, sitting next to the thing it reads, not an
 *     icon in a toolbar somewhere. You press the amount to hear the amount.
 *   - It flips to a stop square while speaking, because the second thing anyone does
 *     with a talking app is want it to stop.
 *   - If the handset has no voice at all, it renders nothing. A button that does
 *     nothing when pressed teaches the user that this app is broken.
 *
 * Built on the browser's own speechSynthesis rather than a server-rendered audio file:
 * no network call, so it works in a field with no signal, and nothing is sent anywhere
 * to be spoken.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { t, type Lang } from "@/lib/i18n";
import { SPEECH_RATE, pickVoice, speakable, speechChunks } from "@/lib/speech";
import { languageMeta } from "@/lib/languages";

export function SpeakButton({
  text,
  lang,
  label,
  size = "md",
  className = "",
}: {
  /** What to read. Passed as written; the speakable() transform happens here. */
  text: string;
  lang: Lang;
  /**
   * Overrides the visible word. `null` drops it entirely and leaves the icon alone,
   * for rows where the word would repeat something already on screen — the spoken
   * label still goes to `aria-label`, so nothing is lost to a screen reader.
   */
  label?: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    const load = () => {
      const voices = window.speechSynthesis.getVoices();
      voicesRef.current = voices;
      // Some engines populate the list asynchronously and fire voiceschanged once;
      // others have it ready immediately. Support is judged on having a voice, not on
      // the API existing, because an API with no voices is a button that does nothing.
      if (voices.length > 0) setSupported(true);
    };

    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(() => {
    const synth = window.speechSynthesis;

    // Pressing a second slip's button while the first is still talking should switch to
    // it, not queue behind it — by then the farmer has moved on.
    synth.cancel();

    const voice = pickVoice(voicesRef.current, lang);
    const chunks = speechChunks(speakable(text, lang));
    if (chunks.length === 0) return;

    chunks.forEach((chunk, i) => {
      const utterance = new SpeechSynthesisUtterance(chunk);
      utterance.lang = voice?.lang ?? languageMeta(lang).speech;
      utterance.rate = SPEECH_RATE;

      // Naming a voice is an optimisation over naming a language, and some engines
      // reject the assignment outright. Letting that throw would take the whole
      // reading down to silence; the `lang` above is enough on its own.
      try {
        if (voice) utterance.voice = voice;
      } catch {
        /* the engine picks for itself from utterance.lang */
      }

      if (i === chunks.length - 1) {
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => setSpeaking(false);
      }

      synth.speak(utterance);
    });

    setSpeaking(true);
  }, [lang, text]);

  if (!supported) return null;

  const word = label === undefined ? t("listen", lang) : label;
  const shown = speaking ? t("stopListening", lang) : word;

  return (
    <button
      type="button"
      onClick={speaking ? stop : speak}
      aria-label={
        speaking ? t("stopListening", lang) : (word || t("listen", lang))
      }
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-[3px] border font-body font-500 ${
        size === "sm"
          ? shown
            ? "h-8 px-2 text-[12px]"
            : "h-8 w-8 justify-center text-[12px]"
          : shown
            ? "h-10 px-2.5 text-[13.5px]"
            : "h-10 w-10 justify-center text-[13.5px]"
      } ${
        speaking
          ? "border-[var(--color-keep)] bg-[var(--color-keep)] text-[var(--color-paper-2)]"
          : "border-[var(--color-rule-strong)] bg-[var(--color-paper)] text-[var(--color-ink-2)]"
      } ${className}`}
    >
      <Icon name={speaking ? "stop" : "speak"} size={size === "sm" ? 15 : 18} />
      {shown && <span>{shown}</span>}
    </button>
  );
}
