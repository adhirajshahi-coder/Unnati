import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickVoice,
  speakable,
  speechChunks,
  SPEECH_RATE,
} from "../src/lib/speech";

/**
 * The read-aloud feature exists for the farmer who cannot read the screen, which means
 * a wrong number read confidently is the worst failure this app has. These tests are
 * about that: what the engine is handed, not how the button looks.
 */

test("digit grouping is removed so a price reads as one number", () => {
  // Left alone, a speech engine reads "12,340" as two numbers separated by a pause.
  const said = speakable("₹12,340", "hi");
  assert.ok(said.includes("12340"), said);
  assert.ok(!said.includes(","), said);
});

test("lakh-scale grouping is removed too", () => {
  const said = speakable("₹1,23,456", "en");
  assert.ok(said.includes("123456"), said);
  assert.equal(said, "123456 rupees");
});

test("the rupee sign becomes a spoken word in each language", () => {
  assert.ok(speakable("₹500", "hi").includes("रुपये"));
  assert.ok(speakable("₹500", "ta").includes("ரூபாய்"));
  assert.ok(speakable("₹500", "bn").includes("টাকা"));
  assert.ok(speakable("₹500", "en").includes("rupees"));
});

test("the word follows the number, not precedes it", () => {
  // "rupees 500" is how the symbol is written; "500 rupees" is how it is said.
  assert.equal(speakable("₹500", "en"), "500 rupees");
});

test("per-quintal prices keep their unit", () => {
  const said = speakable("₹1,240/q", "en");
  assert.equal(said, "1240 rupees per quintal");
});

test("'per quintal' spelled out is handled the same way", () => {
  assert.equal(speakable("₹1,240 per quintal", "en"), "1240 rupees per quintal");
});

test("distances are spelled out rather than spelled letter by letter", () => {
  assert.equal(speakable("210 km", "en"), "210 kilometres");
  assert.ok(speakable("210 km", "hi").includes("किलोमीटर"));
});

test("km inside a word is left alone", () => {
  // A mandi or village name that happens to contain the letters must survive.
  assert.equal(speakable("Kmpur", "en"), "Kmpur");
});

test("hours and percentages are spoken as words", () => {
  assert.equal(speakable("6 h", "en"), "6 hours");
  assert.equal(speakable("12%", "en"), "12 percent");
});

test("slip separators become pauses, not the word 'dot'", () => {
  const said = speakable("Azadpur · 210 km · 6 h", "en");
  assert.ok(!said.includes("·"), said);
  assert.ok(said.includes("Azadpur"), said);
  assert.ok(said.includes("210 kilometres"), said);
});

test("a full slip line survives intact", () => {
  const said = speakable(
    "Best for you: Azadpur, 210 km. Mandi price ₹1,240 per quintal. You take home ₹47,350.",
    "en",
  );
  assert.ok(said.includes("210 kilometres"), said);
  assert.ok(said.includes("1240 rupees per quintal"), said);
  assert.ok(said.includes("47350 rupees"), said);
});

test("an unknown language falls back rather than throwing", () => {
  // Defensive: a stale language value read from the database must not crash a page.
  const said = speakable("₹500", "xx" as never);
  assert.ok(said.includes("500"), said);
});

test("chunks stay under the limit engines silently truncate at", () => {
  const long = Array.from({ length: 40 }, (_, i) => `Sentence ${i}.`).join(" ");
  for (const chunk of speechChunks(long)) {
    assert.ok(chunk.length <= 180, `chunk was ${chunk.length}: ${chunk}`);
  }
});

test("chunking loses no words", () => {
  const long =
    "Mandi price 1240 rupees per quintal. Commission 300 rupees. Market fee 120 rupees. " +
    "Transport, shared truck, 2100 rupees. Spoilage 900 rupees. You take home 47350 rupees. " +
    "That is 4500 rupees more than your nearest mandi and the truck leaves at six in the morning.";

  const rejoined = speechChunks(long).join(" ");
  assert.deepEqual(rejoined.split(/\s+/), long.split(/\s+/));
});

test("a Devanagari danda ends a chunk", () => {
  const chunks = speechChunks("पहला वाक्य। दूसरा वाक्य।", 20);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0], "पहला वाक्य।");
});

test("a single over-long sentence is split at a word, never mid-number", () => {
  const sentence = `You take home 47350 rupees ${"and ".repeat(60)}that is all.`;
  for (const chunk of speechChunks(sentence)) {
    assert.ok(chunk.length <= 180);
    assert.ok(!/\d$/.test(chunk) || chunk.endsWith("rupees"), chunk);
  }
  assert.ok(speechChunks(sentence).join(" ").includes("47350"));
});

test("empty text produces no utterances", () => {
  assert.deepEqual(speechChunks(""), []);
  assert.deepEqual(speechChunks("   "), []);
});

const voice = (lang: string): SpeechSynthesisVoice =>
  ({ lang, name: lang }) as SpeechSynthesisVoice;

test("the exact regional voice wins", () => {
  const chosen = pickVoice([voice("hi-IN"), voice("ta-IN")], "ta");
  assert.equal(chosen?.lang, "ta-IN");
});

test("another region of the same language is next best", () => {
  const chosen = pickVoice([voice("hi-IN"), voice("bn-BD")], "bn");
  assert.equal(chosen?.lang, "bn-BD");
});

test("Hindi covers a language the handset has no voice for", () => {
  // A budget Android with no Odia voice should still say something.
  const chosen = pickVoice([voice("en-US"), voice("hi-IN")], "or");
  assert.equal(chosen?.lang, "hi-IN");
});

test("underscored locale tags from older engines still match", () => {
  const chosen = pickVoice([voice("ta_IN")], "ta");
  assert.equal(chosen?.lang, "ta_IN");
});

test("no voice at all returns null, so the button can hide itself", () => {
  assert.equal(pickVoice([], "hi"), null);
  assert.equal(pickVoice([voice("fr-FR")], "hi"), null);
});

test("the rate is slower than conversational", () => {
  assert.ok(SPEECH_RATE < 1);
});
