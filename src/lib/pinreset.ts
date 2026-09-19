/**
 * Letting someone back into their own account.
 *
 * Two ways in, and everything they share lives here so neither can quietly drift into
 * being weaker than the other:
 *
 *   - **Date of birth**, checked against the registered mobile number. Works with no
 *     email and no network beyond the app itself, which is why it exists.
 *   - **A one-time link by email**, for the minority of farmers who have one.
 *
 * The date-of-birth path is the weaker of the two and is treated accordingly. A birth
 * date is not a secret: a neighbour knows it, and rural records carry enough 1 January
 * entries that an unlimited guesser would be through most accounts in a couple of dozen
 * tries. Three things keep it honest:
 *
 *   1. **A lockout.** Five wrong answers and the account stops accepting recovery for
 *      thirty minutes. That is the difference between a fact someone knows and a fact
 *      someone can grind out.
 *   2. **The owner is told, every time.** A successful reset raises an alert on the
 *      account itself, so a takeover is visible to the person it happened to rather
 *      than discovered when their earnings look wrong.
 *   3. **Accounts with no date of birth cannot use it at all.** An empty field must
 *      never match an empty answer.
 *
 * Nothing here reveals whether a number is registered. Callers get the same answer
 * either way — the sign-in route already refuses to leak that, and guarding one door
 * while leaving the next one open would be pointless.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { users, pinResetTokens } from "@/db/schema";
import { hashPin } from "@/lib/auth";
import { notify } from "@/lib/notifications";

/** Wrong answers before recovery stops being available. */
export const MAX_ATTEMPTS = 5;
/** How long it stops for. */
export const LOCKOUT_MS = 30 * 60 * 1000;
/** How long an emailed link stays usable. */
export const TOKEN_TTL_MS = 30 * 60 * 1000;

export type ResetOutcome =
  | { ok: true }
  | { ok: false; reason: "no-match" | "locked" | "bad-pin" };

/** ISO `YYYY-MM-DD`, which is the only shape the stored value ever takes. */
export function normaliseDob(input: string): string | null {
  const trimmed = input.trim();

  // Accept what an Indian form usually asks for — DD/MM/YYYY or DD-MM-YYYY — as well
  // as the ISO the field stores, because a farmer typing their birth date should not
  // have to know which order this particular app wants it in.
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

export function validPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/**
 * Good enough to catch a typo, deliberately not more.
 *
 * Defined once and imported by both the places that accept an address, because a
 * regex copied into two routes is a regex that ends up meaning two different things —
 * and the failure mode is a farmer whose address is accepted at sign-up and rejected
 * when they try to change it, or the reverse.
 */
export function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Tokens are stored hashed; this is the one place that mapping is defined. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Reset a PIN by proving the date of birth on the account.
 *
 * Returns the same `no-match` for a number that is not registered, a number with no
 * date of birth recorded, and a wrong date — three different situations that must be
 * indistinguishable from outside.
 */
export async function resetByDob(opts: {
  phone: string;
  dob: string;
  newPin: string;
}): Promise<ResetOutcome> {
  if (!validPin(opts.newPin)) return { ok: false, reason: "bad-pin" };

  const dob = normaliseDob(opts.dob);
  const db = await getDb();

  const [user] = await db
    .select({
      id: users.id,
      dateOfBirth: users.dateOfBirth,
      pinAttempts: users.pinAttempts,
      pinLockedUntil: users.pinLockedUntil,
    })
    .from(users)
    .where(eq(users.phone, opts.phone))
    .limit(1);

  if (!user) return { ok: false, reason: "no-match" };

  if (user.pinLockedUntil && user.pinLockedUntil.getTime() > Date.now()) {
    return { ok: false, reason: "locked" };
  }

  const matches =
    dob !== null &&
    user.dateOfBirth !== null &&
    sameString(dob, user.dateOfBirth);

  if (!matches) {
    const attempts = user.pinAttempts + 1;
    await db
      .update(users)
      .set({
        pinAttempts: attempts,
        pinLockedUntil:
          attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null,
      })
      .where(eq(users.id, user.id));

    return {
      ok: false,
      reason: attempts >= MAX_ATTEMPTS ? "locked" : "no-match",
    };
  }

  await applyNewPin(user.id, opts.newPin, "date of birth");
  return { ok: true };
}

/**
 * Issue a one-time link, returning the raw token for the caller to email.
 *
 * Returns null when there is nothing to send to — no such number, or no email on the
 * account. The caller must answer identically either way.
 */
export async function issueEmailToken(
  phoneOrEmail: string,
): Promise<{ token: string; email: string; name: string } | null> {
  const db = await getDb();
  const needle = phoneOrEmail.trim().toLowerCase();

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      pinLockedUntil: users.pinLockedUntil,
    })
    .from(users)
    .where(
      /^\d{10}$/.test(needle) ? eq(users.phone, needle) : eq(users.email, needle),
    )
    .limit(1);

  if (!user?.email) return null;
  if (user.pinLockedUntil && user.pinLockedUntil.getTime() > Date.now()) {
    return null;
  }

  const token = randomBytes(32).toString("base64url");

  await db.insert(pinResetTokens).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });

  return { token, email: user.email, name: user.name };
}

/** Spend a link. A token works once, and only before it expires. */
export async function resetByToken(
  token: string,
  newPin: string,
): Promise<ResetOutcome> {
  if (!validPin(newPin)) return { ok: false, reason: "bad-pin" };

  const db = await getDb();

  const [row] = await db
    .select({ id: pinResetTokens.id, userId: pinResetTokens.userId })
    .from(pinResetTokens)
    .where(
      and(
        eq(pinResetTokens.tokenHash, hashToken(token)),
        isNull(pinResetTokens.usedAt),
        gt(pinResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) return { ok: false, reason: "no-match" };

  await db
    .update(pinResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(pinResetTokens.id, row.id));

  await applyNewPin(row.userId, newPin, "email link");
  return { ok: true };
}

/**
 * Set the PIN, clear the lockout, and tell the account holder.
 *
 * The alert is not a courtesy. It is the only thing standing between a quiet takeover
 * and one the farmer finds out about, which matters most on the date-of-birth path
 * where the thing proved is something a neighbour also knows.
 */
async function applyNewPin(userId: string, pin: string, how: string) {
  const db = await getDb();

  await db
    .update(users)
    .set({
      pinHash: await hashPin(pin),
      pinAttempts: 0,
      pinLockedUntil: null,
    })
    .where(eq(users.id, userId));

  await notify({
    userId,
    type: "SYSTEM",
    title: "Your PIN was changed",
    body: `Someone set a new PIN using your ${how}. If that was not you, tell your field agent now — whoever did it can sign in as you.`,
    titleHi: "आपका पिन बदल दिया गया",
    bodyHi:
      "किसी ने नया पिन बनाया है। अगर यह आपने नहीं किया, तो तुरंत अपने फ़ील्ड एजेंट को बताइए — जिसने किया वह आपके खाते में आ सकता है।",
  });
}
