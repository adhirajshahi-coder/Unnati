/**
 * The languages this app speaks.
 *
 * Thirteen, covering the great majority of Indian farmers by first language. The list
 * is ordered by how many farming households speak each, not alphabetically, because
 * the picker is read by someone looking for their own language and the common ones
 * should be reachable without scrolling.
 *
 * Every language carries three things beyond its name:
 *
 *   - `native`, written in its own script. A picker that lists "Marathi" in Latin is
 *     no use to someone who cannot read Latin; it must say मराठी.
 *   - `speech`, the BCP-47 tag the browser's voice engine wants. This is what makes
 *     the read-aloud feature work in the right language rather than reading Devanagari
 *     with an English voice.
 *   - `rtl`, true only for Urdu, which sets the page direction.
 */

export type Lang =
  | "hi"
  | "en"
  | "mr"
  | "bn"
  | "te"
  | "ta"
  | "gu"
  | "kn"
  | "ml"
  | "pa"
  | "or"
  | "as"
  | "ur";

export interface LanguageMeta {
  code: Lang;
  /** English name, for the ops view and for anyone switching on someone else's behalf. */
  label: string;
  /** The language's own name in its own script — what the picker shows. */
  native: string;
  /** BCP-47 tag for the speech engine. */
  speech: string;
  rtl?: boolean;
  /** Where it is mainly spoken, to help someone recognise their own. */
  where: string;
}

export const LANGUAGES: LanguageMeta[] = [
  { code: "hi", label: "Hindi", native: "हिन्दी", speech: "hi-IN", where: "उत्तर भारत" },
  { code: "en", label: "English", native: "English", speech: "en-IN", where: "All India" },
  { code: "mr", label: "Marathi", native: "मराठी", speech: "mr-IN", where: "महाराष्ट्र" },
  { code: "bn", label: "Bengali", native: "বাংলা", speech: "bn-IN", where: "পশ্চিমবঙ্গ" },
  { code: "te", label: "Telugu", native: "తెలుగు", speech: "te-IN", where: "ఆంధ్ర, తెలంగాణ" },
  { code: "ta", label: "Tamil", native: "தமிழ்", speech: "ta-IN", where: "தமிழ்நாடு" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી", speech: "gu-IN", where: "ગુજરાત" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ", speech: "kn-IN", where: "ಕರ್ನಾಟಕ" },
  { code: "ml", label: "Malayalam", native: "മലയാളം", speech: "ml-IN", where: "കേരളം" },
  { code: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ", speech: "pa-IN", where: "ਪੰਜਾਬ" },
  { code: "or", label: "Odia", native: "ଓଡ଼ିଆ", speech: "or-IN", where: "ଓଡ଼ିଶା" },
  { code: "as", label: "Assamese", native: "অসমীয়া", speech: "as-IN", where: "অসম" },
  { code: "ur", label: "Urdu", native: "اردو", speech: "ur-IN", rtl: true, where: "اتر پردیش" },
];

export const LANG_CODES = LANGUAGES.map((l) => l.code);

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export function languageMeta(lang: Lang): LanguageMeta {
  return BY_CODE.get(lang) ?? BY_CODE.get("hi")!;
}

export function isLang(value: string): value is Lang {
  return BY_CODE.has(value as Lang);
}

/**
 * Where to look when a string has no translation in the requested language.
 *
 * Hindi before English, deliberately. A Marathi or Punjabi speaker who meets an
 * untranslated string is far more likely to read Hindi than English, and the point of
 * this app is to be usable by someone who reads slowly in any script.
 */
export function fallbackChain(lang: Lang): Lang[] {
  if (lang === "hi") return ["hi", "en"];
  if (lang === "en") return ["en", "hi"];
  return [lang, "hi", "en"];
}
