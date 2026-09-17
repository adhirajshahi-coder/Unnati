/**
 * The WhatsApp message templates.
 *
 * This is the part of a WhatsApp integration that is easy to get wrong, so it is
 * stated plainly here rather than discovered in production.
 *
 * WhatsApp does not let a business send arbitrary text to a user. Outside a 24-hour
 * window opened by the user messaging *us*, every message must be one of a small set
 * of **templates approved in advance by Meta**, with the variable parts passed as
 * ordered parameters. Every notification this app sends — a price alert at dawn, a
 * truck-pooling alert, a payment reminder seven days out — is business-initiated and
 * therefore falls under that rule.
 *
 * So the catalogue below is not a formatting convenience. It is the contract with
 * Meta: each entry must be registered in the WhatsApp Manager under exactly this name,
 * in these languages, with this number of parameters in this order. `npm run wa:templates`
 * prints them in submission form.
 *
 * Inside the 24-hour window — a farmer who has just asked the assistant something —
 * free-form replies are allowed, which is what makes the WhatsApp side of the
 * assistant possible at all.
 */
import { fallbackChain, type Lang } from "@/lib/languages";

/** Notification types this app raises, mapped to the template that carries them. */
export type TemplateKey =
  | "price_alert"
  | "pooling_alert"
  | "billing_reminder"
  | "trip_update"
  | "spoilage_warning"
  | "welcome";

export interface TemplateSpec {
  /** Registered name in WhatsApp Manager. Lower snake case is Meta's requirement. */
  name: string;
  /** Meta's category, which decides pricing and review path. */
  category: "UTILITY" | "MARKETING";
  /** What each ordered {{n}} parameter holds, for whoever registers these. */
  params: string[];
  /** The body as it must be submitted, per language. */
  body: TemplateBody;
}

/**
 * The languages a template is registered in.
 *
 * English and Hindi are required, because every send has to land somewhere. The other
 * eleven are optional, and deliberately so. The app's *screens* are translated freely —
 * a new language there costs nothing but the words. A WhatsApp template is a contract
 * with Meta, and each language is a separate submission that Meta reviews and approves;
 * an unapproved locale is not a slightly worse message, it is a message that does not
 * send at all.
 *
 * So a language appears below only once its body has actually been registered in the
 * WhatsApp Manager. Until then `templateLanguage` routes that farmer to Hindi, which is
 * registered, rather than to a locale Meta would reject.
 */
export type TemplateBody = Partial<Record<Lang, string>> & {
  en: string;
  hi: string;
};

export const TEMPLATES: Record<TemplateKey, TemplateSpec> = {
  price_alert: {
    name: "unnati_price_alert",
    category: "UTILITY",
    params: ["crop", "mandi name", "price per quintal", "distance in km"],
    body: {
      en: "UNNATI: {{1}} is fetching {{3}} per quintal at {{2}}, {{4}} km from you. Open the app to see what you would keep after transport.",
      hi: "उन्नति: {{2}} में {{1}} का भाव {{3}} प्रति क्विंटल है, आपसे {{4}} किमी दूर। ढुलाई काटकर कितना बचेगा, ऐप में देखें।",
    },
  },

  pooling_alert: {
    name: "unnati_pooling_alert",
    category: "UTILITY",
    params: ["mandi name", "farmer count", "weight gathered"],
    body: {
      en: "UNNATI: farmers near you are sharing a truck to {{1}}. {{2}} have joined with {{3}} between them. Join and the cost splits by weight.",
      hi: "उन्नति: आपके पास के किसान {{1}} के लिए ट्रक साझा कर रहे हैं। {{2}} किसान जुड़ चुके हैं, {{3}} माल तैयार है। जुड़िए — खर्च वज़न के हिसाब से बँटेगा।",
    },
  },

  billing_reminder: {
    name: "unnati_billing_reminder",
    category: "UTILITY",
    params: ["amount", "due date", "what it is for"],
    body: {
      en: "UNNATI: {{1}} is due on {{2}} for {{3}}. This is your seven-day notice — you can pay by UPI in the app.",
      hi: "उन्नति: {{3}} के लिए {{1}} का भुगतान {{2}} तक देना है। यह सात दिन पहले की सूचना है — ऐप में UPI से भुगतान कर सकते हैं।",
    },
  },

  trip_update: {
    name: "unnati_trip_update",
    category: "UTILITY",
    params: ["mandi name", "status in words"],
    body: {
      en: "UNNATI: your consignment to {{1}} is {{2}}. Track the truck in the app.",
      hi: "उन्नति: {{1}} जा रही आपकी उपज {{2}}। ऐप में ट्रक देखें।",
    },
  },

  spoilage_warning: {
    name: "unnati_spoilage_warning",
    category: "UTILITY",
    params: ["crop", "hours remaining"],
    body: {
      en: "UNNATI: send your {{1}} within about {{2}} hours or it will start losing value on the road.",
      hi: "उन्नति: अपनी {{1}} लगभग {{2}} घंटे में भेज दें, वरना रास्ते में ख़राब होने लगेगी।",
    },
  },

  welcome: {
    name: "unnati_welcome",
    category: "UTILITY",
    params: ["name"],
    body: {
      en: "UNNATI: {{1}}, WhatsApp alerts are on. You will get mandi prices, truck-sharing alerts and payment reminders here. Reply STOP any time to turn them off.",
      hi: "उन्नति: {{1}}, व्हाट्सएप सूचनाएँ चालू हो गईं। मंडी भाव, ट्रक साझा करने की ख़बर और भुगतान की याद यहीं मिलेगी। बंद करने के लिए कभी भी STOP लिखें।",
    },
  },
};

/** Which template carries each notification type. */
export const TEMPLATE_FOR: Record<string, TemplateKey | null> = {
  PRICE_ALERT: "price_alert",
  POOLING_ALERT: "pooling_alert",
  BILLING_REMINDER: "billing_reminder",
  TRIP_UPDATE: "trip_update",
  SPOILAGE_WARNING: "spoilage_warning",
  // Housekeeping messages are not worth a WhatsApp send, and Meta would not thank us
  // for registering a template to carry them.
  SYSTEM: null,
  // Raised once, when someone turns the channel on.
  WELCOME: "welcome",
};

/**
 * Fill a template locally, for the log and for the no-credentials path.
 *
 * The provider does this substitution itself from the ordered parameters — this is
 * what the farmer will see, recorded so the ops view and any later dispute can read
 * the actual message rather than a template name and a list of arguments.
 */
export function renderTemplate(
  key: TemplateKey,
  lang: Lang,
  params: string[],
): string {
  const spec = TEMPLATES[key];
  const body = spec.body[templateLanguage(key, lang)] ?? spec.body.en;
  return body.replace(/\{\{(\d+)\}\}/g, (_, n) => {
    const value = params[Number(n) - 1];
    return value ?? "";
  });
}

/**
 * Which registered language this template will actually go out in.
 *
 * Walks the same fallback chain the screens use, but stops at a language whose body
 * exists here — and by the rule above, "exists here" and "approved at Meta" mean the
 * same thing. Both the locale sent to the API and the body written to our own log come
 * from this one function, so the message we record can never disagree with the message
 * Meta delivers.
 */
export function templateLanguage(key: TemplateKey, lang: Lang): Lang {
  const spec = TEMPLATES[key];
  for (const candidate of fallbackChain(lang)) {
    if (spec.body[candidate]) return candidate;
  }
  return "en";
}

/** True when the parameter count matches what Meta has registered. */
export function paramsValid(key: TemplateKey, params: string[]): boolean {
  return params.length === TEMPLATES[key].params.length;
}
