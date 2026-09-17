/**
 * Sending a notification over WhatsApp.
 *
 * The decisions that matter here, in order:
 *
 *   1. Has this person opted in? If not, nothing is sent. Meta requires documented
 *      consent, and messaging a farmer who never agreed is how a business number gets
 *      blocked for everyone using it.
 *   2. Is their number a valid Indian mobile? A guess here messages a stranger.
 *   3. Is there a template for this kind of notification? Housekeeping messages do not
 *      get one and are simply not sent.
 *   4. Are we inside the 24-hour window they opened by messaging us? If so a plain
 *      reply is allowed; otherwise it must be the approved template.
 *
 * Every attempt is written to `whatsapp_messages` before the provider is called, so a
 * message that fails or is never acknowledged is still visible afterwards rather than
 * lost.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users, whatsappMessages } from "@/db/schema";
import type { Lang } from "@/lib/i18n";
import {
  TEMPLATES,
  TEMPLATE_FOR,
  renderTemplate,
  paramsValid,
  templateLanguage,
} from "./templates";
import {
  sendTemplate,
  sendText,
  toWaId,
  waLanguageCode,
  whatsappConfigured,
} from "./client";

export { whatsappConfigured } from "./client";
export { TEMPLATES, TEMPLATE_FOR } from "./templates";

/** Meta's customer-service window: free-form replies allowed this long after inbound. */
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export function insideServiceWindow(lastInboundAt: Date | null): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - lastInboundAt.getTime() < SERVICE_WINDOW_MS;
}

export interface DispatchInput {
  userId: string;
  notificationId?: string;
  /** The notification type; decides which template carries it. */
  notifType: string;
  params: string[];
  /** Used when the service window is open, where plain text is allowed. */
  fallbackText?: string;
}

export interface DispatchResult {
  status: "SENT" | "QUEUED" | "FAILED" | "SKIPPED";
  reason?: string;
}

export async function dispatchWhatsapp(
  input: DispatchInput,
): Promise<DispatchResult> {
  const db = await getDb();

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      phone: users.phone,
      language: users.language,
      whatsappOptIn: users.whatsappOptIn,
      whatsappNumber: users.whatsappNumber,
      whatsappLastInboundAt: users.whatsappLastInboundAt,
    })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  if (!user) return { status: "SKIPPED", reason: "no such user" };
  if (!user.whatsappOptIn) {
    return { status: "SKIPPED", reason: "not opted in to WhatsApp" };
  }

  const waId = toWaId(user.whatsappNumber ?? user.phone);
  if (!waId) {
    return { status: "SKIPPED", reason: "not a valid Indian mobile number" };
  }

  const key = TEMPLATE_FOR[input.notifType] ?? null;
  const open = insideServiceWindow(user.whatsappLastInboundAt);

  if (!key && !open) {
    return {
      status: "SKIPPED",
      reason: `no approved template for ${input.notifType}`,
    };
  }

  const lang = user.language as Lang;

  // Inside the window a plain message reads better than a template with its fixed
  // scaffolding, and costs nothing. Outside it, the template is the only legal option.
  const useTemplate = !open || !input.fallbackText;

  if (useTemplate && key && !paramsValid(key, input.params)) {
    return {
      status: "FAILED",
      reason: `template ${TEMPLATES[key].name} expects ${TEMPLATES[key].params.length} parameters, got ${input.params.length}`,
    };
  }

  const body =
    useTemplate && key
      ? renderTemplate(key, lang, input.params)
      : (input.fallbackText ?? "");

  const [row] = await db
    .insert(whatsappMessages)
    .values({
      userId: user.id,
      notificationId: input.notificationId,
      direction: "OUTBOUND",
      templateName: useTemplate && key ? TEMPLATES[key].name : null,
      body,
      status: "QUEUED",
    })
    .returning();

  if (!whatsappConfigured()) {
    await db
      .update(whatsappMessages)
      .set({
        status: "SKIPPED",
        error: "WhatsApp credentials not configured",
        updatedAt: new Date(),
      })
      .where(eq(whatsappMessages.id, row.id));

    return { status: "SKIPPED", reason: "WhatsApp is not configured" };
  }

  const result =
    useTemplate && key
      ? await sendTemplate({
          to: waId,
          templateName: TEMPLATES[key].name,
          languageCode: waLanguageCode(templateLanguage(key, lang)),
          params: input.params,
        })
      : await sendText({ to: waId, body });

  await db
    .update(whatsappMessages)
    .set({
      status: result.ok ? "SENT" : "FAILED",
      providerMessageId: result.providerMessageId,
      error: result.error,
      sentAt: result.ok ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(whatsappMessages.id, row.id));

  return result.ok
    ? { status: "SENT" }
    : { status: "FAILED", reason: result.error };
}

/**
 * Record an incoming message and open the service window.
 *
 * The window is the whole reason inbound matters beyond the message itself: once a
 * farmer has written to us, we can answer in plain words for the next day instead of
 * through a template.
 */
export async function recordInbound(opts: {
  waId: string;
  body: string;
  providerMessageId?: string;
}): Promise<{ userId: string; language: Lang } | null> {
  const db = await getDb();

  // The stored number is the 10-digit local form; the webhook gives it with 91.
  const local = opts.waId.replace(/^91/, "");

  const [user] = await db
    .select({ id: users.id, language: users.language })
    .from(users)
    .where(eq(users.phone, local))
    .limit(1);

  if (!user) return null;

  const now = new Date();

  await db
    .update(users)
    .set({ whatsappLastInboundAt: now })
    .where(eq(users.id, user.id));

  await db.insert(whatsappMessages).values({
    userId: user.id,
    direction: "INBOUND",
    body: opts.body,
    status: "DELIVERED",
    providerMessageId: opts.providerMessageId,
    sentAt: now,
    updatedAt: now,
  });

  return { userId: user.id, language: user.language as Lang };
}

/** Apply a delivery receipt from Meta's webhook. */
export async function applyReceipt(
  providerMessageId: string,
  status: string,
  errorText?: string,
) {
  const mapped = {
    sent: "SENT",
    delivered: "DELIVERED",
    read: "READ",
    failed: "FAILED",
  }[status.toLowerCase()];

  if (!mapped) return;

  const db = await getDb();

  // Never walk a message backwards: Meta can deliver receipts out of order, and a
  // late "sent" arriving after "read" would otherwise undo what we know.
  const rank = { QUEUED: 0, SKIPPED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };

  const [row] = await db
    .select({ id: whatsappMessages.id, status: whatsappMessages.status })
    .from(whatsappMessages)
    .where(eq(whatsappMessages.providerMessageId, providerMessageId))
    .limit(1);

  if (!row) return;
  if (
    mapped !== "FAILED" &&
    rank[mapped as keyof typeof rank] <= rank[row.status as keyof typeof rank]
  ) {
    return;
  }

  await db
    .update(whatsappMessages)
    .set({
      status: mapped as "SENT" | "DELIVERED" | "READ" | "FAILED",
      error: errorText,
      updatedAt: new Date(),
    })
    .where(eq(whatsappMessages.id, row.id));
}

/** Turn WhatsApp alerts on or off for one user. */
export async function setOptIn(
  userId: string,
  optIn: boolean,
  whatsappNumber?: string | null,
) {
  const db = await getDb();

  await db
    .update(users)
    .set({
      whatsappOptIn: optIn,
      whatsappOptInAt: optIn ? new Date() : null,
      ...(whatsappNumber !== undefined ? { whatsappNumber } : {}),
    })
    .where(eq(users.id, userId));
}

/** Recent traffic for the ops view. */
export async function recentMessages(limit = 40) {
  const db = await getDb();
  return db
    .select({
      id: whatsappMessages.id,
      direction: whatsappMessages.direction,
      templateName: whatsappMessages.templateName,
      body: whatsappMessages.body,
      status: whatsappMessages.status,
      error: whatsappMessages.error,
      createdAt: whatsappMessages.createdAt,
      userName: users.name,
      userPhone: users.phone,
    })
    .from(whatsappMessages)
    .innerJoin(users, eq(users.id, whatsappMessages.userId))
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(limit);
}

/** How many people each role has opted in, for the ops view. */
export async function optInCounts() {
  const db = await getDb();

  const rows = await db
    .select({ role: users.role, optIn: users.whatsappOptIn })
    .from(users)
    .where(and(eq(users.whatsappOptIn, true)));

  return {
    farmers: rows.filter((r) => r.role === "FARMER").length,
    operators: rows.filter((r) => r.role === "OPERATOR").length,
    total: rows.length,
  };
}

/**
 * A plain reply, inside the 24-hour window the farmer just opened.
 *
 * Recorded whether or not credentials exist, for the same reason the template path
 * is: an ops view that shows "this is the answer we would have sent" is worth far
 * more during a pilot than one that silently drops it. It is also how the assistant's
 * WhatsApp answers become auditable — the figures in them came from the engine, and
 * the log is where anyone checks that.
 */
export async function sendFreeform(opts: {
  userId: string;
  waId: string;
  body: string;
}): Promise<DispatchResult> {
  const db = await getDb();

  const [row] = await db
    .insert(whatsappMessages)
    .values({
      userId: opts.userId,
      direction: "OUTBOUND",
      templateName: null,
      body: opts.body,
      status: "QUEUED",
    })
    .returning();

  if (!whatsappConfigured()) {
    await db
      .update(whatsappMessages)
      .set({
        status: "SKIPPED",
        error: "WhatsApp credentials not configured",
        updatedAt: new Date(),
      })
      .where(eq(whatsappMessages.id, row.id));
    return { status: "SKIPPED", reason: "WhatsApp is not configured" };
  }

  const result = await sendText({ to: opts.waId, body: opts.body });

  await db
    .update(whatsappMessages)
    .set({
      status: result.ok ? "SENT" : "FAILED",
      providerMessageId: result.providerMessageId,
      error: result.error,
      sentAt: result.ok ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(whatsappMessages.id, row.id));

  return result.ok
    ? { status: "SENT" }
    : { status: "FAILED", reason: result.error };
}
