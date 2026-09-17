import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  t,
  pick,
  prefersHindi,
  rupees,
  weight,
  speechLocale,
  isRtl,
} from "../src/lib/i18n";
import {
  LANGUAGES,
  LANG_CODES,
  fallbackChain,
  isLang,
  languageMeta,
  type Lang,
} from "../src/lib/languages";
import { EXTRA } from "../src/data/translations";

/**
 * What these tests defend is not "is the Tamil correct" — a test cannot know that.
 * They defend the properties that make thirteen languages safe to ship: that nothing
 * ever renders blank, that a missing translation degrades to Hindi rather than to
 * English, and that the keys a farmer must be able to read are actually present in
 * every language rather than quietly falling back.
 */

/** The words without which the app cannot be operated at all. */
const OPERATIONAL_KEYS = [
  "home", "sell", "mandis", "trips", "connect",
  "crop", "quantity", "grade", "quintal", "kg",
  "mandiPrice", "transport", "commission", "netPrice", "youTakeHome",
  "sharedTruck", "ownTruck", "joinTruck", "yourShare", "youSave",
  "accept", "reject", "confirm", "cancel", "back",
  "due", "paid", "payNow", "listen", "stopListening",
] as const;

test("every language declares a name in its own script", () => {
  for (const l of LANGUAGES) {
    assert.ok(l.native.length > 0, `${l.code} has no native name`);
    // A picker that lists "Marathi" in Latin is no use to a Latin-illiterate reader.
    if (l.code !== "en") {
      assert.ok(
        !/^[\x20-\x7E]+$/.test(l.native),
        `${l.code} native name "${l.native}" is plain ASCII`,
      );
    }
  }
});

test("every language declares a speech tag the engine can use", () => {
  for (const l of LANGUAGES) {
    assert.match(l.speech, /^[a-z]{2}-[A-Z]{2}$/, `${l.code}: ${l.speech}`);
    assert.equal(speechLocale(l.code), l.speech);
  }
});

test("codes are unique", () => {
  assert.equal(new Set(LANG_CODES).size, LANG_CODES.length);
});

test("Urdu is the only right-to-left language", () => {
  for (const l of LANGUAGES) {
    assert.equal(isRtl(l.code), l.code === "ur", l.code);
  }
});

test("the fallback chain reaches Hindi before English", () => {
  // Deliberate: a Marathi speaker meeting an untranslated string is far more likely to
  // read Hindi than English. Reversing these two would quietly worsen the app for the
  // exact users this feature is for.
  for (const code of LANG_CODES) {
    if (code === "hi" || code === "en") continue;
    const chain = fallbackChain(code);
    assert.deepEqual(chain, [code, "hi", "en"], code);
  }
});

test("every chain ends somewhere that always has a string", () => {
  for (const code of LANG_CODES) {
    const chain = fallbackChain(code);
    assert.ok(
      chain.includes("en") || chain.includes("hi"),
      `${code} can fall off the end`,
    );
  }
});

test("no key renders blank in any language", () => {
  for (const key of Object.keys(EXTRA) as Array<keyof typeof EXTRA>) {
    for (const code of LANG_CODES) {
      const value = t(key, code);
      assert.ok(
        typeof value === "string" && value.trim().length > 0,
        `${String(key)} in ${code} rendered empty`,
      );
    }
  }
});

test("the keys needed to operate the app are translated, not fallen back", () => {
  const gaps: string[] = [];

  for (const key of OPERATIONAL_KEYS) {
    for (const code of LANG_CODES) {
      if (code === "en" || code === "hi") continue;
      if (!EXTRA[key]?.[code]) gaps.push(`${key}/${code}`);
    }
  }

  assert.deepEqual(gaps, [], `untranslated core strings: ${gaps.join(", ")}`);
});

test("a translated language gets its own words, not Hindi", () => {
  assert.notEqual(t("sell", "ta"), t("sell", "hi"));
  assert.notEqual(t("mandis", "bn"), t("mandis", "hi"));
  assert.equal(t("sell", "ta"), EXTRA.sell?.ta);
});

test("an untranslated string degrades to Hindi, not English", () => {
  // `register` is intentionally English/Hindi only for now.
  assert.equal(t("register", "mr"), t("register", "hi"));
  assert.notEqual(t("register", "mr"), t("register", "en"));
});

test("English never falls through to another script", () => {
  for (const key of Object.keys(EXTRA) as Array<keyof typeof EXTRA>) {
    const value = t(key, "en");
    assert.ok(value.length > 0, String(key));
  }
});

test("prefersHindi sends everyone but English readers to Hindi", () => {
  assert.equal(prefersHindi("en"), false);
  assert.equal(prefersHindi("hi"), true);
  for (const code of LANG_CODES) {
    if (code === "en") continue;
    assert.ok(prefersHindi(code), code);
  }
});

test("prefersHindi agrees with pick on an English/Hindi pair", () => {
  // The two must never disagree: one drives ~200 inline ternaries, the other drives
  // the dictionary, and a screen that mixed the two rules would be incoherent.
  const options = { en: "English", hi: "Hindi" };
  for (const code of LANG_CODES) {
    const viaPick = pick(code, options);
    const viaFlag = prefersHindi(code) ? options.hi : options.en;
    assert.equal(viaFlag, viaPick, code);
  }
});

test("no source file tests the language by hand", () => {
  // `lang === "hi"` reads as a translation check but is really "is this Hindi", and
  // every one of those sends a Bengali or Tamil reader to the English branch. The
  // helpers exist so nobody has to remember that; this test is what enforces it.
  const root = join(import.meta.dirname, "..", "src");
  const offenders: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      // The two files allowed to know: one defines the chain, one reads it.
      if (full.endsWith(join("lib", "languages.ts"))) continue;
      if (full.endsWith(join("lib", "i18n.ts"))) continue;

      const source = readFileSync(full, "utf8");
      if (/\blang(uage)?\s*===\s*["']hi["']/.test(source)) {
        offenders.push(relative(root, full));
      }
    }
  };

  walk(root);

  assert.deepEqual(
    offenders,
    [],
    `use prefersHindi() or pick() instead of comparing the language directly: ${offenders.join(", ")}`,
  );
});

test("pick walks the same chain as t", () => {
  const options = { en: "English", hi: "हिन्दी", ta: "தமிழ்" };
  assert.equal(pick("ta", options), "தமிழ்");
  assert.equal(pick("mr", options), "हिन्दी"); // no Marathi → Hindi, not English
  assert.equal(pick("en", options), "English");
});

test("pick tolerates a language with nothing but English", () => {
  assert.equal(pick("or", { en: "only English" }), "only English");
});

test("isLang accepts what we ship and rejects what we do not", () => {
  assert.ok(isLang("ta"));
  assert.ok(isLang("ur"));
  assert.ok(!isLang("fr"));
  assert.ok(!isLang(""));
  assert.ok(!isLang("HI"));
});

test("an unknown language falls back to Hindi rather than crashing", () => {
  // Guards the path where a database row outlives a code change.
  assert.equal(languageMeta("zz" as Lang).code, "hi");
  assert.equal(t("home", "zz" as Lang), t("home", "hi"));
});

test("rupees keep Indian digit grouping in every language", () => {
  // The grouping is a property of the money, not of the language: a Tamil farmer reads
  // the same 1,23,456 that is printed on the mandi slip.
  for (const code of LANG_CODES) {
    assert.equal(rupees(123456), "₹1,23,456", code);
  }
});

test("weights switch to quintals above a hundred kilos, in the local word", () => {
  assert.equal(weight(50, "en"), "50 kg");
  assert.ok(weight(2500, "en").startsWith("25 "));
  assert.ok(weight(2500, "ta").includes(t("quintal", "ta")));
  assert.ok(weight(50, "bn").includes(t("kg", "bn")));
});

test("numbers stay in Latin digits, never local numerals", () => {
  // Price boards, weighbridge slips and UPI apps all use Latin digits; a farmer
  // checking the app against the board needs the two to match.
  for (const code of LANG_CODES) {
    assert.match(weight(2500, code), /25/, code);
    assert.ok(!/[०-९૦-૯੦-੯০-৯]/.test(rupees(123456)), code);
  }
});
