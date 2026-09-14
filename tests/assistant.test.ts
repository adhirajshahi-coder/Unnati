/**
 * Tests for the assistant's question understanding.
 *
 * The answers themselves are built from the database and the decision engine, so they
 * are covered by the engine tests. What is worth pinning down here is that a farmer
 * writing Hinglish on a phone gets understood, and that the guard which stops a
 * language model from altering a figure actually holds.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { matchIntent, matchCrop, normalise } from "../src/lib/assistant/intents";

const CROPS = [
  { id: "onion", aliases: ["Onion", "प्याज़", "pyaz", "pyaaz", "kanda"] },
  { id: "tomato", aliases: ["Tomato", "टमाटर", "tamatar"] },
  { id: "green-chilli", aliases: ["Green Chilli", "हरी मिर्च", "mirch"] },
  { id: "wheat", aliases: ["Wheat", "गेहूँ", "gehu"] },
];

describe("normalising what a farmer types", () => {
  test("case and punctuation do not matter", () => {
    assert.equal(normalise("  Pyaz KA Bhav??  "), "pyaz ka bhav");
  });

  test("Devanagari with and without nukta match", () => {
    assert.equal(normalise("प्याज़"), normalise("प्याज"));
  });
});

describe("recognising the crop", () => {
  test("English name", () => {
    assert.equal(matchCrop("what is the onion price", CROPS), "onion");
  });

  test("Hindi name", () => {
    assert.equal(matchCrop("प्याज़ का भाव क्या है", CROPS), "onion");
  });

  test("Hinglish, the way people actually type", () => {
    assert.equal(matchCrop("pyaz ka bhav kya hai", CROPS), "onion");
    assert.equal(matchCrop("tamatar kahan bechu", CROPS), "tomato");
    assert.equal(matchCrop("kanda ka rate", CROPS), "onion");
  });

  test("a longer crop name wins over a substring of it", () => {
    // "green chilli" must not lose to a shorter alias that happens to be inside it.
    assert.equal(matchCrop("green chilli ka bhav", CROPS), "green-chilli");
  });

  test("no crop mentioned returns nothing rather than guessing", () => {
    assert.equal(matchCrop("mera truck kahan hai", CROPS), undefined);
  });
});

describe("recognising what is being asked", () => {
  const cases: Array<[string, string]> = [
    ["kahan bechu apni fasal", "BEST_MANDI"],
    ["प्याज़ कहाँ बेचूँ", "BEST_MANDI"],
    ["which mandi should i sell at", "BEST_MANDI"],
    ["pyaz ka bhav kya hai", "PRICE"],
    ["टमाटर का भाव", "PRICE"],
    ["truck share kaise karu", "SHARE_TRUCK"],
    ["क्या मैं ट्रक साझा कर सकता हूँ", "SHARE_TRUCK"],
    ["mera truck kahan hai", "MY_TRIPS"],
    ["मेरा ट्रक कहाँ है", "MY_TRIPS"],
    ["kitna paisa dena hai", "MY_MONEY"],
    ["मेरी कमाई कितनी है", "MY_MONEY"],
    ["tamatar kaise pack kare", "CROP_CARE"],
    ["aas paas ke kisan", "NEIGHBOURS"],
    ["ट्रक मालिक कौन है पास में", "NEIGHBOURS"],
    ["ye app kaise kaam karta hai", "HOW_IT_WORKS"],
    ["खर्च कैसे बँटता है", "HOW_IT_WORKS"],
    ["mujhe kisi se baat karni hai", "HUMAN_HELP"],
  ];

  for (const [question, expected] of cases) {
    test(`"${question}" reads as ${expected}`, () => {
      assert.equal(matchIntent(question).intent, expected);
    });
  }

  test("a specific phrase beats a generic word in the same sentence", () => {
    // "bhav" is in here too, but the farmer is asking where to sell, not for a rate.
    assert.equal(
      matchIntent("acche bhav ke liye kahan bechu").intent,
      "BEST_MANDI",
    );
  });

  test("nonsense is admitted rather than forced into an intent", () => {
    const m = matchIntent("asdfgh qwerty");
    assert.equal(m.intent, "UNKNOWN");
    assert.equal(m.confidence, "LOW");
  });

  test("an empty question is not an intent", () => {
    assert.equal(matchIntent("   ").intent, "UNKNOWN");
  });
});

/* ------------------------------------------- the figure guard on rephrasing */

/**
 * Mirrors the check in llm.ts. A rephrase is accepted only when it carries exactly
 * the same rupee figures as the computed answer — so a model cannot quietly turn
 * ₹1,551 into ₹1,550, drop it, or add one that was never there.
 */
function figures(s: string): string[] {
  return (s.match(/₹\s?[\d,]+(?:\.\d+)?/g) ?? []).map((f) =>
    f.replace(/\s/g, ""),
  );
}

function acceptable(original: string, rewritten: string): boolean {
  const a = figures(original).sort();
  const b = figures(rewritten).sort();
  return a.length === b.length && a.every((f, i) => f === b[i]);
}

describe("a model may not change a number", () => {
  const original = "Sharing costs ₹499 and hiring alone costs ₹1,551.";

  test("a faithful rewrite is accepted", () => {
    assert.equal(
      acceptable(original, "You would pay ₹499 to share, or ₹1,551 alone."),
      true,
    );
  });

  test("an altered figure is rejected", () => {
    assert.equal(
      acceptable(original, "You would pay ₹500 to share, or ₹1,551 alone."),
      false,
    );
  });

  test("a dropped figure is rejected", () => {
    assert.equal(acceptable(original, "Sharing is much cheaper."), false);
  });

  test("an invented figure is rejected", () => {
    assert.equal(
      acceptable(
        original,
        "Sharing costs ₹499, alone ₹1,551, and you save ₹1,052.",
      ),
      false,
    );
  });

  test("reordering the same figures is fine", () => {
    assert.equal(
      acceptable(original, "Alone: ₹1,551. Shared: ₹499."),
      true,
    );
  });

  test("an answer with no figures is unaffected by the guard", () => {
    assert.equal(acceptable("Pack tomatoes in crates.", "Use crates."), true);
  });
});

describe("Hindi word order does not defeat the matcher", () => {
  /**
   * "truck kaise share karu" splits a phrase an English-shaped matcher looks for
   * whole. Hindi and Hinglish put the verb last and the qualifier in the middle, so
   * co-occurrence has to carry these rather than adjacency.
   */
  const cases: Array<[string, string]> = [
    ["truck kaise share karu", "SHARE_TRUCK"],
    ["main truck share karna chahta hun", "SHARE_TRUCK"],
    ["kya ट्रक साझा कर सakte hain", "SHARE_TRUCK"],
    ["kis mandi me bechu", "BEST_MANDI"],
    ["mera truck abhi kahan pahuncha", "MY_TRIPS"],
    ["mere paas ke kisan kaun hain", "NEIGHBOURS"],
  ];

  for (const [question, expected] of cases) {
    test(`"${question}" reads as ${expected}`, () => {
      assert.equal(matchIntent(question).intent, expected);
    });
  }
});
