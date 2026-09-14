/**
 * Notification service.
 *
 * FR-8: price and truck-pooling notifications.
 * FR-9: billing notifications **7 days prior to the due date**.
 *
 * Notifications are written to the database with a `scheduledFor` timestamp and read
 * back when that time arrives. A row whose `scheduledFor` is in the future is a
 * promise to notify, not a notification — which is exactly what FR-9 describes, and
 * it means the 7-day rule is enforced at write time rather than depending on a cron
 * job firing on the right day.
 *
 * Delivery channel follows the user's connectivity: PUSH by default, with SMS/IVR the
 * documented fallback for low-bandwidth users (PRD §8). Actual carrier delivery needs
 * an SMS gateway, which is a deployment concern; everything up to the handoff is here,
 * and IN_APP delivery works today.
 */
import { and, eq, lte, desc, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { notifications, transactions } from "@/db/schema";
import { rupees } from "@/lib/i18n";

/** FR-9 — how far ahead of a due date a billing reminder is raised. */
export const BILLING_NOTICE_DAYS = 7;

type NotifType =
  | "PRICE_ALERT"
  | "POOLING_ALERT"
  | "BILLING_REMINDER"
  | "TRIP_UPDATE"
  | "SPOILAGE_WARNING"
  | "SYSTEM";

type Channel = "PUSH" | "SMS" | "IVR" | "IN_APP";

export interface NotifyInput {
  userId: string;
  type: NotifType;
  title: string;
  body: string;
  titleHi?: string;
  bodyHi?: string;
  channel?: Channel;
  scheduledFor?: Date;
  href?: string;
}

export async function notify(input: NotifyInput) {
  const db = await getDb();
  const scheduledFor = input.scheduledFor ?? new Date();

  await db.insert(notifications).values({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    titleHi: input.titleHi,
    bodyHi: input.bodyHi,
    channel: input.channel ?? "IN_APP",
    scheduledFor,
    // A notification scheduled for now is delivered now; a future one waits.
    sentAt: scheduledFor.getTime() <= Date.now() ? new Date() : null,
    href: input.href,
  });
}

/**
 * Record a charge and, in the same breath, schedule its reminder.
 *
 * Keeping these together is deliberate: it is not possible to create a payable in this
 * codebase without the 7-day warning being scheduled, so FR-9 cannot be missed by
 * forgetting to call a second function.
 */
export async function chargeWithReminder(opts: {
  userId: string;
  loadId?: string;
  tripId?: string;
  kind: "TRANSPORT_CHARGE" | "PLATFORM_FEE" | "OPERATOR_SETTLEMENT";
  amount: number;
  dueDate: Date;
  note?: string;
  mandiName?: string;
}) {
  const db = await getDb();

  const [txn] = await db
    .insert(transactions)
    .values({
      userId: opts.userId,
      loadId: opts.loadId,
      tripId: opts.tripId,
      kind: opts.kind,
      amount: opts.amount,
      status: "DUE",
      dueDate: opts.dueDate,
      note: opts.note,
    })
    .returning();

  const remindAt = new Date(
    opts.dueDate.getTime() - BILLING_NOTICE_DAYS * 24 * 60 * 60 * 1000,
  );

  const due = opts.dueDate.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });

  await notify({
    userId: opts.userId,
    type: "BILLING_REMINDER",
    title: `${rupees(opts.amount)} due on ${due}`,
    body: opts.mandiName
      ? `Your transport share for the ${opts.mandiName} trip is ${rupees(opts.amount)}, due on ${due}. Pay by UPI in the app.`
      : `${rupees(opts.amount)} is due on ${due}.`,
    titleHi: `${rupees(opts.amount)} का भुगतान ${due} तक`,
    bodyHi: opts.mandiName
      ? `${opts.mandiName} यात्रा के लिए आपकी ढुलाई का हिस्सा ${rupees(opts.amount)} है, ${due} तक देना है।`
      : `${rupees(opts.amount)} ${due} तक देना है।`,
    channel: "SMS",
    // Never schedule a reminder in the past: a bill due in three days should warn
    // immediately, not silently skip.
    scheduledFor: remindAt.getTime() > Date.now() ? remindAt : new Date(),
    href: "/farmer/earnings",
  });

  return txn;
}

/** Notifications a user should see now — nothing scheduled for the future leaks out. */
export async function inbox(userId: string, limit = 50) {
  const db = await getDb();
  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        lte(notifications.scheduledFor, new Date()),
      ),
    )
    .orderBy(desc(notifications.scheduledFor))
    .limit(limit);
}

export async function unreadCount(userId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        lte(notifications.scheduledFor, new Date()),
        isNull(notifications.readAt),
      ),
    );
  return rows.length;
}

export async function markAllRead(userId: string) {
  const db = await getDb();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    );
}

/** Told to every farmer already on a trip when its state changes. */
export async function notifyTripWatchers(
  farmerIds: string[],
  tripId: string,
  title: string,
  body: string,
  titleHi?: string,
  bodyHi?: string,
) {
  await Promise.all(
    farmerIds.map((userId) =>
      notify({
        userId,
        type: "TRIP_UPDATE",
        title,
        body,
        titleHi,
        bodyHi,
        channel: "PUSH",
        href: `/farmer/trip/${tripId}`,
      }),
    ),
  );
}
