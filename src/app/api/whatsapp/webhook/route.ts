import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import {
  recordInbound,
  applyReceipt,
  setOptIn,
  sendFreeform,
} from "@/lib/whatsapp";
import { toWaId } from "@/lib/whatsapp/client";
import { ask } from "@/lib/assistant";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Meta's webhook verification handshake.
 *
 * Called once when the webhook URL is registered in the Meta dashboard: Meta sends a
 * challenge and expects it echoed back verbatim, having first checked the token
 * matches what was configured there.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token &&
    token === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }

  return new NextResponse("forbidden", { status: 403 });
}

/**
 * Everything WhatsApp tells us: delivery receipts, and messages farmers send.
 *
 * Meta retries a webhook that does not answer 200 quickly, and a duplicate delivery of
 * an inbound message would mean answering a farmer twice. So this always returns 200
 * once it has the payload, and does the work behind that — a failure here is ours to
 * see in the logs, not Meta's to retry into a loop.
 *
 * Inbound is where this becomes more than a notification channel. A farmer who cannot
 * keep the app open on a weak connection can type "pyaz ka bhav" into WhatsApp and get
 * the same grounded answer the assistant gives in the app, because their message opens
 * a 24-hour window in which plain replies are allowed.
 */
export async function POST(req: Request) {
  let payload: WebhookPayload;

  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    await handle(payload);
  } catch (err) {
    console.error("[whatsapp] webhook handling failed", err);
  }

  return NextResponse.json({ ok: true });
}

interface WebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
          button?: { text?: string };
        }>;
        statuses?: Array<{
          id?: string;
          status?: string;
          errors?: Array<{ title?: string; message?: string }>;
        }>;
      };
    }>;
  }>;
}

async function handle(payload: WebhookPayload) {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      for (const status of value.statuses ?? []) {
        if (!status.id || !status.status) continue;
        const err = status.errors?.[0];
        await applyReceipt(
          status.id,
          status.status,
          err ? (err.message ?? err.title) : undefined,
        );
      }

      for (const message of value.messages ?? []) {
        await handleInbound(message);
      }
    }
  }
}

/** Words that turn alerts off, in the forms people actually send. */
const STOP_WORDS = ["stop", "unsubscribe", "band", "बंद", "बन्द", "रोको"];
const START_WORDS = ["start", "chalu", "चालू", "शुरू"];

async function handleInbound(message: {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
}) {
  const from = message.from;
  const body = (message.text?.body ?? message.button?.text ?? "").trim();
  if (!from || !body) return;

  const known = await recordInbound({
    waId: from,
    body,
    providerMessageId: message.id,
  });

  // Someone messaging from a number we have never registered. Replying would mean
  // starting a conversation with a stranger, so we do not.
  if (!known) return;

  const normalised = body.toLowerCase();

  if (STOP_WORDS.some((w) => normalised === w || normalised.startsWith(w))) {
    await setOptIn(known.userId, false);
    await reply(
      known.userId,
      from,
      known.language === "hi"
        ? "उन्नति: व्हाट्सएप सूचनाएँ बंद कर दी गईं। दोबारा चालू करने के लिए START लिखें।"
        : "UNNATI: WhatsApp alerts are off. Send START to turn them back on.",
    );
    return;
  }

  if (START_WORDS.some((w) => normalised === w)) {
    await setOptIn(known.userId, true);
    await reply(
      known.userId,
      from,
      known.language === "hi"
        ? "उन्नति: सूचनाएँ फिर से चालू हैं।"
        : "UNNATI: alerts are on again.",
    );
    return;
  }

  // Anything else is a question. The assistant answers it from the app's own data —
  // the same engine that draws the screens — so a price quoted over WhatsApp is the
  // price the farmer would see if they opened the app.
  const db = await getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, known.userId))
    .limit(1);
  if (!user) return;

  const answer = await ask(body, user, known.language);

  const lines = [answer.text];
  for (const fact of answer.facts ?? []) {
    lines.push(`• ${fact.label}: ${fact.value}`);
  }

  await reply(known.userId, from, lines.join("\n"));
}

/**
 * A plain reply, legal because their message just opened the 24-hour window.
 *
 * Goes through the recording path so the reply is in the log either way — on a
 * deployment without credentials that log is the only place anyone can see what the
 * assistant answered over WhatsApp.
 */
async function reply(userId: string, to: string, body: string) {
  const waId = toWaId(to);
  if (!waId) return;
  await sendFreeform({ userId, waId, body });
}
