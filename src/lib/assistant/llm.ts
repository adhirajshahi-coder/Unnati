/**
 * The optional language-model layer.
 *
 * It does exactly two jobs, and neither of them involves a number:
 *
 *   1. Read a question in Hindi, English or Hinglish and say which intent it is.
 *   2. Rephrase an answer the app has already computed, into warmer, plainer words.
 *
 * It never sources a fact. The answer text it is given is built in `answer.ts` from
 * the database and the decision engine, and the rephrase prompt forbids changing any
 * figure. If the rephrase comes back with a rupee amount that was not in the original,
 * the original is used instead — checked, not trusted.
 *
 * That is not caution for its own sake. A farmer is deciding whether to drive 200 km
 * on these numbers, and "no number a farmer sees comes from a model" is a promise the
 * rest of this codebase keeps. An assistant is not a reason to break it.
 *
 * Configure with `OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY`. With neither, the
 * assistant runs on keyword matching and templates, which is a real product, not a
 * broken one — it is what works on a deployment with no budget for tokens.
 */
import type { Intent } from "./intents";

const INTENTS: Intent[] = [
  "BEST_MANDI",
  "PRICE",
  "SHARE_TRUCK",
  "MY_TRIPS",
  "MY_MONEY",
  "CROP_CARE",
  "NEIGHBOURS",
  "HOW_IT_WORKS",
  "HUMAN_HELP",
  "UNKNOWN",
];

export function llmConfigured(): boolean {
  return Boolean(
    process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY,
  );
}

interface ChatResult {
  text: string | null;
}

/** One completion call, whichever provider is configured. */
async function complete(
  system: string,
  user: string,
  maxTokens: number,
): Promise<ChatResult> {
  const timeout = AbortSignal.timeout(
    Number(process.env.ASSISTANT_TIMEOUT_MS ?? 12_000),
  );

  try {
    if (process.env.ANTHROPIC_API_KEY) {
      const res = await fetch(
        `${process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com"}/v1/messages`,
        {
          method: "POST",
          signal: timeout,
          headers: {
            "content-type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: process.env.ASSISTANT_MODEL ?? "claude-haiku-4-5-20251001",
            max_tokens: maxTokens,
            system,
            messages: [{ role: "user", content: user }],
          }),
        },
      );
      if (!res.ok) return { text: null };
      const body = await res.json();
      return { text: body?.content?.[0]?.text ?? null };
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: timeout,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.ASSISTANT_MODEL ?? "google/gemma-3-27b-it:free",
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return { text: null };
    const body = await res.json();
    return { text: body?.choices?.[0]?.message?.content ?? null };
  } catch {
    // A timeout or a provider outage must not take the assistant down; the caller
    // falls back to keyword matching and templates.
    return { text: null };
  }
}

/** Ask the model which intent a question is. Returns null if it cannot say. */
export async function classify(question: string): Promise<Intent | null> {
  if (!llmConfigured()) return null;

  const system = `You label farmer questions for an Indian agriculture app. Questions come in Hindi, English or Hinglish.

Reply with exactly one label from this list and nothing else:
${INTENTS.join(", ")}

BEST_MANDI  - which market should I sell at
PRICE       - what is a crop selling for
SHARE_TRUCK - sharing or pooling a truck with other farmers
MY_TRIPS    - where is my consignment or truck
MY_MONEY    - what do I owe, what have I earned
CROP_CARE   - packing, handling, storage, spoilage
NEIGHBOURS  - finding nearby farmers or truck owners
HOW_IT_WORKS- what this app does, how the cost split works
HUMAN_HELP  - wants to speak to a person
UNKNOWN     - anything else`;

  const { text } = await complete(system, question, 16);
  if (!text) return null;

  const found = INTENTS.find((i) => text.toUpperCase().includes(i));
  return found ?? null;
}

/** Every rupee figure in a string, as written. */
function figures(s: string): string[] {
  return (s.match(/₹\s?[\d,]+(?:\.\d+)?/g) ?? []).map((f) =>
    f.replace(/\s/g, ""),
  );
}

/**
 * Rephrase a computed answer.
 *
 * The result is only used if it carries exactly the same set of rupee figures as the
 * original. A model that drops, invents or alters a number has failed the one rule
 * that matters here, and its output is discarded rather than repaired.
 */
export async function rephrase(
  answer: string,
  question: string,
  lang: "en" | "hi",
): Promise<string | null> {
  if (!llmConfigured()) return null;

  const system = `You rewrite short answers for smallholder farmers in India who may read slowly.

RULES, in order of importance:
1. Never change, add or remove a number, a rupee amount, a distance, a percentage or a market name. Copy them exactly as given.
2. Do not add any fact that is not in the text you are given. If the text does not say something, neither do you.
3. Keep it under 60 words, in plain ${lang === "hi" ? "Hindi" : "English"}, warm and direct.
4. Reply with the rewritten answer only.`;

  const { text } = await complete(
    system,
    `Farmer asked: ${question}\n\nAnswer to rewrite:\n${answer}`,
    300,
  );
  if (!text) return null;

  const cleaned = text.trim();
  if (!cleaned || cleaned.length > 700) return null;

  const before = figures(answer).sort();
  const after = figures(cleaned).sort();

  if (before.length !== after.length) return null;
  if (before.some((f, i) => f !== after[i])) return null;

  return cleaned;
}
