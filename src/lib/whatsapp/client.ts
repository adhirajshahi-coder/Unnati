/**
 * Talking to WhatsApp.
 *
 * Meta's Cloud API directly, rather than through a reseller: it is the cheapest path,
 * it has no middleman holding the number, and the request shape is small enough that
 * an SDK would add more than it removes.
 *
 * Configure with:
 *   WHATSAPP_PHONE_NUMBER_ID   the sending number's id from WhatsApp Manager
 *   WHATSAPP_ACCESS_TOKEN      a permanent System User token, not a temporary one
 *   WHATSAPP_VERIFY_TOKEN      any string; Meta echoes it when registering the webhook
 *
 * With none of these the app records what it would have sent and marks it SKIPPED.
 * That is deliberate: a pilot without a verified Meta Business account still needs to
 * work, and an ops dashboard that shows "would have sent 34 messages" is more useful
 * than one that silently drops them.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: string;
  /** True when no credentials are configured, so nothing was attempted. */
  skipped?: boolean;
}

export function whatsappConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN,
  );
}

/**
 * Indian mobile number to the form WhatsApp expects: country code, no plus, no spaces.
 *
 * Farmers type their number every way there is — with a leading zero, with +91, with
 * spaces or dashes from a contact card. All of those are the same person, and a
 * notification that silently fails because of a punctuation mark is worse than one
 * that never existed.
 */
export function toWaId(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");

  // 10-digit Indian mobile, which is what this app stores.
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;

  // 0-prefixed local dialling.
  if (/^0[6-9]\d{9}$/.test(digits)) return `91${digits.slice(1)}`;

  // Already carries the country code.
  if (/^91[6-9]\d{9}$/.test(digits)) return digits;

  // Anything else is either not a mobile or not Indian; refuse rather than guess,
  // because guessing here means messaging a stranger.
  return null;
}

async function post(
  body: Record<string, unknown>,
): Promise<SendResult> {
  if (!whatsappConfigured()) {
    return { ok: false, skipped: true, error: "WhatsApp is not configured" };
  }

  try {
    const res = await fetch(
      `${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
      },
    );

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      // Meta nests the useful part; surface it so the ops view shows "template not
      // approved" rather than "HTTP 400".
      const detail =
        json?.error?.error_user_msg ??
        json?.error?.message ??
        `HTTP ${res.status}`;
      return { ok: false, error: String(detail) };
    }

    return { ok: true, providerMessageId: json?.messages?.[0]?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "request failed",
    };
  }
}

/** A pre-approved template with ordered parameters — the business-initiated path. */
export async function sendTemplate(opts: {
  to: string;
  templateName: string;
  languageCode: string;
  params: string[];
}): Promise<SendResult> {
  return post({
    to: opts.to,
    type: "template",
    template: {
      name: opts.templateName,
      language: { code: opts.languageCode },
      components: opts.params.length
        ? [
            {
              type: "body",
              parameters: opts.params.map((text) => ({ type: "text", text })),
            },
          ]
        : [],
    },
  });
}

/**
 * Free-form text. Only valid inside the 24-hour window opened by the user messaging
 * us — Meta rejects it otherwise, which is why the caller checks first.
 */
export async function sendText(opts: {
  to: string;
  body: string;
}): Promise<SendResult> {
  return post({
    to: opts.to,
    type: "text",
    text: { preview_url: false, body: opts.body.slice(0, 4096) },
  });
}

/** Meta's language codes differ from ours for Hindi. */
export function waLanguageCode(lang: "en" | "hi"): string {
  return lang === "hi" ? "hi" : "en";
}
