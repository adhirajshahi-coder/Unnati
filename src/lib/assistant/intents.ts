/**
 * Working out what a farmer is asking.
 *
 * Questions arrive in Hindi, English, and the Hinglish most people actually type —
 * "pyaz ka bhav kya hai", "kahan bechu", "mera truck kahan hai". So matching is done
 * on a normalised string against keyword sets in all three, rather than on grammar.
 *
 * This runs whether or not a language model is configured. When one is, it proposes
 * the intent instead and this stays as the fallback — which matters, because the
 * assistant has to work on a deployment with no API key and on a handset with a bad
 * connection, and a farmer asking where their truck is deserves an answer either way.
 */

export type Intent =
  | "BEST_MANDI" // where should I sell?
  | "PRICE" // what is X paying today?
  | "SHARE_TRUCK" // how do I share a truck / is there a group?
  | "MY_TRIPS" // where is my truck?
  | "MY_MONEY" // what do I owe, what did I earn?
  | "CROP_CARE" // how do I pack/handle this?
  | "NEIGHBOURS" // who is near me to work with?
  | "HOW_IT_WORKS" // what is this app, how does the split work?
  | "HUMAN_HELP" // I want to talk to a person
  | "UNKNOWN";

export interface Match {
  intent: Intent;
  /** Crop mentioned, as a catalogue id, when one was recognised. */
  cropId?: string;
  confidence: "HIGH" | "LOW";
}

/**
 * Strip case, punctuation and Devanagari vowel signs so "प्याज़" and "प्याज" match,
 * and so "bhav?" matches "bhav".
 */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[़।॥]/g, "") // nukta, danda
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Word groups that mean an intent when they all appear, in any order and anywhere in
 * the sentence.
 *
 * Hindi and Hinglish put words where English would not — "truck kaise share karu"
 * splits a phrase an English-shaped matcher expects to find whole. Requiring
 * co-occurrence rather than adjacency handles that without pretending to parse grammar.
 */
const PAIRS: Array<{ intent: Intent; all: string[] }> = [
  { intent: "SHARE_TRUCK", all: ["truck", "share"] },
  { intent: "SHARE_TRUCK", all: ["truck", "saajha"] },
  { intent: "SHARE_TRUCK", all: ["truck", "sajha"] },
  { intent: "SHARE_TRUCK", all: ["ट्रक", "साझा"] },
  { intent: "SHARE_TRUCK", all: ["truck", "milkar"] },
  { intent: "SHARE_TRUCK", all: ["gaadi", "share"] },
  { intent: "SHARE_TRUCK", all: ["truck", "baant"] },
  { intent: "BEST_MANDI", all: ["mandi", "bechu"] },
  { intent: "BEST_MANDI", all: ["मंडी", "बेचूँ"] },
  { intent: "BEST_MANDI", all: ["where", "sell"] },
  { intent: "PRICE", all: ["mandi", "bhav"] },
  { intent: "MY_TRIPS", all: ["truck", "kahan"] },
  { intent: "MY_TRIPS", all: ["gaadi", "kahan"] },
  { intent: "CROP_CARE", all: ["kaise", "rakhu"] },
  { intent: "NEIGHBOURS", all: ["kisan", "paas"] },
  { intent: "NEIGHBOURS", all: ["farmer", "near"] },
  { intent: "NEIGHBOURS", all: ["truck", "wala"] },
];

/** Keyword sets per intent, in Hindi, Hinglish and English. */
const KEYWORDS: Array<{ intent: Intent; words: string[] }> = [
  {
    intent: "BEST_MANDI",
    words: [
      "kahan bechu", "kaha bechu", "kahan bech", "kis mandi", "konsi mandi",
      "kaun si mandi", "which mandi", "what mandi", "best mandi",
      "where sell", "where should i sell", "where do i sell",
      "sabse acchi mandi", "sabse achi mandi", "zyada daam", "jyada daam",
      "कहाँ बेचूँ", "कहां बेचूं", "कौन सी मंडी", "किस मंडी", "सबसे अच्छी मंडी",
      "ज़्यादा दाम", "best price mandi", "most profit",
    ],
  },
  {
    intent: "PRICE",
    words: [
      "bhav", "bhaav", "rate", "price", "daam", "dam", "kitna mil", "kya chal",
      "भाव", "दाम", "कीमत", "रेट", "कितना मिलेगा", "आज का भाव", "mandi price",
      "today price", "aaj ka",
    ],
  },
  {
    intent: "SHARE_TRUCK",
    words: [
      "share truck", "shared truck", "truck share", "pool", "group",
      "saajha", "sajha", "saaza", "milkar", "mil kar", "bant", "baant",
      "साझा", "समूह", "मिलकर", "ट्रक साझा", "बँटवारा",
      "split truck", "together truck", "chota kisan", "small farmer",
      "adha truck", "aadha truck", "half truck",
    ],
  },
  {
    intent: "MY_TRIPS",
    words: [
      "mera truck", "meri gaadi", "meri gadi", "truck kahan", "gaadi kahan",
      "kab pahunch", "kab pohonch", "track", "kahan hai",
      "मेरा ट्रक", "ट्रक कहाँ", "गाड़ी कहाँ", "कब पहुँच", "मेरी यात्रा",
      "where is my truck", "my trip", "delivery",
    ],
  },
  {
    intent: "MY_MONEY",
    words: [
      "paisa", "paise", "kitna dena", "kitna baki", "bakaya", "bill",
      "payment", "kamai", "kitna kamaya", "hisab", "hisaab",
      "पैसा", "पैसे", "कितना देना", "बाकी", "बकाया", "कमाई", "हिसाब", "भुगतान",
      "how much do i owe", "my earnings", "due",
    ],
  },
  {
    intent: "CROP_CARE",
    words: [
      "kaise rakh", "kaise pack", "pack", "kharab", "sad", "sadne",
      "bachaye", "bachaun", "handling", "store", "kitne din",
      "कैसे रखें", "कैसे पैक", "खराब", "सड़", "बचाएँ", "कितने दिन", "रखरखाव",
      "how to pack", "spoil", "shelf life", "keep fresh",
    ],
  },
  {
    intent: "NEIGHBOURS",
    words: [
      "aas paas", "aaspaas", "paas ke kisan", "nearby farmer", "other farmer",
      "truck wala", "truck owner", "operator", "transporter", "gaadi wala",
      "आस पास", "पास के किसान", "दूसरे किसान", "ट्रक वाला", "ट्रक मालिक",
      "connect", "contact farmer", "milna", "saath", "साथ",
    ],
  },
  {
    intent: "HOW_IT_WORKS",
    words: [
      "kaise kaam", "kya hai ye", "kya hai yah", "kaise use", "kaise chalu",
      "how does this work", "what is unnati", "how to use", "kaise banta",
      "kharcha kaise", "कैसे काम", "यह क्या है", "कैसे इस्तेमाल", "खर्च कैसे",
      "बँटवारा कैसे", "how is cost split",
    ],
  },
  {
    intent: "HUMAN_HELP",
    words: [
      "baat karni", "insaan", "aadmi se", "call karo", "phone karo",
      "complaint", "shikayat", "help me", "madad",
      "बात करनी", "इंसान", "शिकायत", "मदद", "फ़ोन", "talk to someone",
    ],
  },
];

/**
 * Crops are matched separately from intent, because "pyaz ka bhav" and "pyaz kahan
 * bechu" name the same crop but ask different things.
 */
export interface CropAlias {
  id: string;
  aliases: string[];
}

export function matchCrop(text: string, crops: CropAlias[]): string | undefined {
  const q = normalise(text);
  // Longest alias first, so "green chilli" is not shadowed by "chilli".
  const flat = crops
    .flatMap((c) => c.aliases.map((a) => ({ id: c.id, alias: normalise(a) })))
    .filter((a) => a.alias.length > 1)
    .sort((a, b) => b.alias.length - a.alias.length);

  return flat.find((a) => q.includes(a.alias))?.id;
}

/**
 * Best-effort intent from keywords.
 *
 * Scored by how much of the question a keyword covers, so a long specific phrase
 * ("kahan bechu") beats a short generic one ("bhav") appearing in the same sentence.
 */
export function matchIntent(text: string): Match {
  const q = normalise(text);
  if (!q) return { intent: "UNKNOWN", confidence: "LOW" };

  let best: { intent: Intent; score: number } | null = null;

  for (const { intent, words } of KEYWORDS) {
    for (const word of words) {
      const w = normalise(word);
      if (!w || !q.includes(w)) continue;
      const score = w.length;
      if (!best || score > best.score) best = { intent, score };
    }
  }

  // Co-occurring words score by their combined length, so "truck … share" beats a
  // lone "truck" and reads as a deliberate phrasing rather than a coincidence.
  for (const { intent, all } of PAIRS) {
    const words = all.map(normalise);
    if (!words.every((w) => q.includes(w))) continue;
    const score = words.reduce((n, w) => n + w.length, 0) + 2;
    if (!best || score > best.score) best = { intent, score };
  }

  if (!best) return { intent: "UNKNOWN", confidence: "LOW" };

  return {
    intent: best.intent,
    // A one-word hit on a short generic keyword is a guess, not a reading.
    confidence: best.score >= 6 ? "HIGH" : "LOW",
  };
}
