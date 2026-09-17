/**
 * Preparing text to be read aloud.
 *
 * The whole point of this feature is the farmer who cannot read the screen. That person
 * is listening to a rupee figure they are about to make a decision on, so the figure has
 * to arrive as a number they recognise — and left alone, a browser's speech engine
 * mangles exactly the things this app is made of.
 *
 * Three specific failures, all of them observed rather than theoretical:
 *
 *   - **Digit grouping.** "₹12,340" is read by most engines as "twelve, three hundred
 *     and forty" — the comma becomes a list separator and a farmer hears two numbers
 *     instead of one. Stripping the separators is not cosmetic; it is the difference
 *     between ₹12,340 and nonsense.
 *   - **The rupee sign.** Some voices say it, some skip it silently, and a skipped
 *     currency is worse than a wrong one because nothing sounds amiss. It becomes the
 *     word, in the listener's own language.
 *   - **Abbreviations.** "210 km" reads as "two hundred ten kay em". Spelled out, it is
 *     a distance.
 *
 * Everything here is a pure string transform so it can be tested without a browser. The
 * speaking itself lives in the SpeakButton component, which is the only part that needs
 * a DOM.
 */
import { languageMeta, type Lang } from "./languages";

interface SpeechWords {
  rupees: string;
  km: string;
  hours: string;
  percent: string;
  perQuintal: string;
}

/**
 * The handful of words the transforms above need, per language.
 *
 * Deliberately not read from the main dictionary: these are spoken forms, not written
 * ones. A slip prints "₹/q" because the column is narrow; a voice has to say "rupees
 * per quintal" because there is no column.
 */
const WORDS: Record<Lang, SpeechWords> = {
  hi: { rupees: "रुपये", km: "किलोमीटर", hours: "घंटे", percent: "प्रतिशत", perQuintal: "रुपये प्रति क्विंटल" },
  en: { rupees: "rupees", km: "kilometres", hours: "hours", percent: "percent", perQuintal: "rupees per quintal" },
  mr: { rupees: "रुपये", km: "किलोमीटर", hours: "तास", percent: "टक्के", perQuintal: "रुपये प्रति क्विंटल" },
  bn: { rupees: "টাকা", km: "কিলোমিটার", hours: "ঘণ্টা", percent: "শতাংশ", perQuintal: "টাকা প্রতি কুইন্টাল" },
  te: { rupees: "రూపాయలు", km: "కిలోమీటర్లు", hours: "గంటలు", percent: "శాతం", perQuintal: "రూపాయలు క్వింటాల్‌కు" },
  ta: { rupees: "ரூபாய்", km: "கிலோமீட்டர்", hours: "மணி", percent: "சதவீதம்", perQuintal: "ரூபாய் ஒரு குவிண்டாலுக்கு" },
  gu: { rupees: "રૂપિયા", km: "કિલોમીટર", hours: "કલાક", percent: "ટકા", perQuintal: "રૂપિયા પ્રતિ ક્વિન્ટલ" },
  kn: { rupees: "ರೂಪಾಯಿ", km: "ಕಿಲೋಮೀಟರ್", hours: "ಗಂಟೆ", percent: "ಶೇಕಡಾ", perQuintal: "ರೂಪಾಯಿ ಪ್ರತಿ ಕ್ವಿಂಟಾಲ್" },
  ml: { rupees: "രൂപ", km: "കിലോമീറ്റർ", hours: "മണിക്കൂർ", percent: "ശതമാനം", perQuintal: "രൂപ ക്വിന്റലിന്" },
  pa: { rupees: "ਰੁਪਏ", km: "ਕਿਲੋਮੀਟਰ", hours: "ਘੰਟੇ", percent: "ਫ਼ੀਸਦੀ", perQuintal: "ਰੁਪਏ ਪ੍ਰਤੀ ਕੁਇੰਟਲ" },
  or: { rupees: "ଟଙ୍କା", km: "କିଲୋମିଟର", hours: "ଘଣ୍ଟା", percent: "ପ୍ରତିଶତ", perQuintal: "ଟଙ୍କା ପ୍ରତି କୁଇଣ୍ଟାଲ" },
  as: { rupees: "টকা", km: "কিলোমিটাৰ", hours: "ঘণ্টা", percent: "শতাংশ", perQuintal: "টকা প্ৰতি কুইণ্টল" },
  ur: { rupees: "روپے", km: "کلومیٹر", hours: "گھنٹے", percent: "فیصد", perQuintal: "روپے فی کوئنٹل" },
};

/**
 * Rewrite a line of interface text into something a speech engine reads correctly.
 *
 * Order matters: "₹1,240/q" has to lose its slash-abbreviation before the bare rupee
 * rule gets to it, or the farmer hears "1240 rupees q".
 */
export function speakable(text: string, lang: Lang): string {
  const w = WORDS[lang] ?? WORDS.hi;

  return (
    text
      // Bullets, arrows and the dot separators that structure a slip visually. Spoken,
      // they are either silence or the word "dot", and neither helps.
      .replace(/[·•▸►→—–]/g, ", ")

      // "₹1,240/q" and "₹1,240 per quintal" — the compound unit, before anything else.
      .replace(/₹\s*([\d,]+(?:\.\d+)?)\s*(?:\/\s*q\b|per quintal)/gi, (_, n) =>
        `${ungroup(n)} ${w.perQuintal}`,
      )

      // A plain amount. The sign moves behind the number because that is where the word
      // goes in every language here, including English as it is spoken about money.
      .replace(/₹\s*([\d,]+(?:\.\d+)?)/g, (_, n) => `${ungroup(n)} ${w.rupees}`)

      // Units. The word boundary keeps "km" out of the middle of a mandi name.
      .replace(/([\d.]+)\s*km\b/gi, (_, n) => `${n} ${w.km}`)
      .replace(/([\d.]+)\s*kms\b/gi, (_, n) => `${n} ${w.km}`)
      .replace(/([\d.]+)\s*h\b/g, (_, n) => `${n} ${w.hours}`)
      .replace(/([\d.]+)\s*%/g, (_, n) => `${n} ${w.percent}`)

      // Any grouped number left over — a weight, a count of farmers.
      .replace(/\b\d{1,3}(?:,\d{2,3})+\b/g, (m) => ungroup(m))

      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

/** "1,23,456" → "123456", so the engine reads one number instead of three. */
function ungroup(n: string): string {
  return n.replace(/,/g, "");
}

/**
 * Break a passage into pieces a speech engine will actually finish.
 *
 * Chrome's synthesiser stops partway through anything much beyond a couple of hundred
 * characters, silently — and a recommendation that stops halfway through the amount is
 * worse than one that was never read. Splitting on sentence ends keeps the pauses where
 * a listener expects them.
 */
export function speechChunks(text: string, limit = 180): string[] {
  // Whitespace-only input has to yield nothing rather than one blank utterance: the
  // button would flip to "Stop" and then sit there silently, which reads as a broken
  // app to exactly the user who has no other way to check.
  const sentences = text.trim().split(/(?<=[।.!?])\s+/);
  const out: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (!sentence.trim()) continue;

    if (sentence.length > limit) {
      if (current) {
        out.push(current);
        current = "";
      }
      // A single sentence longer than the limit: break it at commas rather than
      // mid-word, which is what a naive slice would do to a rupee figure.
      for (const part of hardSplit(sentence, limit)) out.push(part);
      continue;
    }

    if ((current + " " + sentence).trim().length > limit) {
      if (current) out.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }

  if (current) out.push(current);
  return out;
}

function hardSplit(sentence: string, limit: number): string[] {
  const words = sentence.split(/\s+/);
  const out: string[] = [];
  let current = "";

  for (const word of words) {
    if ((current + " " + word).trim().length > limit && current) {
      out.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }

  if (current) out.push(current);
  return out;
}

/**
 * The voice to use, given what this handset actually has installed.
 *
 * Indian language voices are far from universal — a budget Android may ship Hindi and
 * English and nothing else. Rather than fail silently on Odia, this walks down: the
 * exact language, then any voice for that language in another region, then Hindi, then
 * whatever the browser defaults to. Hindi read in an Odia speaker's ear is imperfect;
 * silence is useless.
 */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
  lang: Lang,
): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  const tag = languageMeta(lang).speech; // e.g. "or-IN"
  const base = tag.split("-")[0];

  return (
    voices.find((v) => v.lang.replace("_", "-") === tag) ??
    voices.find((v) => v.lang.replace("_", "-").startsWith(`${base}-`)) ??
    voices.find((v) => v.lang.replace("_", "-").startsWith("hi-")) ??
    null
  );
}

/**
 * Slower than conversational.
 *
 * The listener is holding a decision in their head while the sentence runs — which
 * mandi, how far, how much is left after the truck. Default rate is tuned for someone
 * skimming a notification, not for someone doing arithmetic on what they hear.
 */
export const SPEECH_RATE = 0.9;
