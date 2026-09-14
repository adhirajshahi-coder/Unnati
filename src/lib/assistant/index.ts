/**
 * The assistant: question in, grounded answer out.
 *
 * Order of work, and why:
 *
 *   1. Find the crop mentioned, if any — from the real catalogue, both scripts.
 *   2. Decide the intent. Keywords first, because they are instant and free. A model
 *      is consulted only when keywords are unsure, which keeps the common questions
 *      fast and the token bill near zero.
 *   3. Build the answer from the database and the decision engine.
 *   4. Optionally let a model rephrase it, with every figure checked afterwards.
 *
 * The model is never between the farmer and the data. It reads the question and it
 * polishes the wording; the facts come from the same code that draws the screens.
 */
import { getDb } from "@/db";
import { crops } from "@/db/schema";
import type { User } from "@/db/schema";
import type { Lang } from "@/lib/i18n";
import { matchIntent, matchCrop, type Intent } from "./intents";
import { buildAnswer, type Answer } from "./answer";
import { classify, rephrase, llmConfigured } from "./llm";

export type { Answer } from "./answer";
export { llmConfigured } from "./llm";

/** Crop names in both scripts, plus the spellings farmers actually type. */
const EXTRA_ALIASES: Record<string, string[]> = {
  onion: ["pyaz", "pyaaz", "kanda", "pyas"],
  tomato: ["tamatar", "tamater"],
  potato: ["aloo", "alu"],
  cauliflower: ["gobhi", "gobi", "phool gobhi"],
  cabbage: ["patta gobhi", "bandh gobhi"],
  brinjal: ["baingan", "bengan", "eggplant"],
  okra: ["bhindi", "bhendi", "ladyfinger", "lady finger"],
  "green-chilli": ["mirch", "hari mirch", "mirchi"],
  cucumber: ["kheera", "khira"],
  "bottle-gourd": ["lauki", "ghiya"],
  "bitter-gourd": ["karela"],
  peas: ["matar", "mutter"],
  carrot: ["gajar"],
  spinach: ["palak"],
  coriander: ["dhaniya", "dhania"],
  garlic: ["lehsun", "lahsun"],
  ginger: ["adrak"],
  grape: ["angoor", "angur"],
  pomegranate: ["anar", "anaar"],
  banana: ["kela"],
  mango: ["aam"],
  apple: ["seb", "safarchand"],
  papaya: ["papita"],
  orange: ["santra", "santara"],
  wheat: ["gehu", "gehun", "gehoon"],
  paddy: ["dhan", "chawal", "rice"],
  maize: ["makka", "makai"],
  bajra: ["bajri"],
  gram: ["chana", "channa"],
  tur: ["arhar", "tuar", "toor"],
  moong: ["mung"],
  soybean: ["soya"],
  mustard: ["sarson"],
  groundnut: ["mungfali", "moongfali", "peanut"],
  cotton: ["kapas"],
};

export interface AskResult extends Answer {
  /** How the intent was decided, so the UI can be honest about it. */
  resolvedBy: "keywords" | "model";
}

export async function ask(
  question: string,
  user: User,
  lang: Lang,
): Promise<AskResult> {
  const db = await getDb();

  const catalogue = await db
    .select({ id: crops.id, name: crops.name, nameHi: crops.nameHi })
    .from(crops);

  const cropId = matchCrop(
    question,
    catalogue.map((c) => ({
      id: c.id,
      aliases: [c.name, c.nameHi, c.id.replace(/-/g, " "), ...(EXTRA_ALIASES[c.id] ?? [])],
    })),
  );

  const keyword = matchIntent(question);
  let intent: Intent = keyword.intent;
  let resolvedBy: "keywords" | "model" = "keywords";

  // Only pay for a model call when the keywords are genuinely unsure. Most questions
  // a farmer asks are short and unambiguous, and answering those instantly matters
  // more on a slow connection than answering them elegantly.
  if (keyword.confidence === "LOW" && llmConfigured()) {
    const guess = await classify(question);
    if (guess) {
      intent = guess;
      resolvedBy = "model";
    }
  }

  // A crop name with no clear intent almost always means "what is it worth".
  if (intent === "UNKNOWN" && cropId) intent = "PRICE";

  const answer = await buildAnswer(intent, user, lang, cropId);

  const polished = await rephrase(answer.text, question, lang);
  if (polished) {
    answer.text = polished;
    answer.rephrased = true;
  }

  return { ...answer, resolvedBy };
}
