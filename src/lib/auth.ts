/**
 * Authentication.
 *
 * Farmers sign in with a phone number and a 4-digit PIN. That is the pattern rural
 * users already know from banking and UPI apps, and it does not require an email
 * address or a password manager.
 *
 * In production this would sit behind a real OTP on first registration. The PIN is
 * hashed with scrypt from `node:crypto` — no native dependency, nothing to install,
 * and it is a memory-hard KDF rather than a bare hash.
 */
import { randomBytes, scrypt, timingSafeEqual, createHmac } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users, type User } from "@/db/schema";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;
export const SESSION_COOKIE = "unnati_session";
const SESSION_DAYS = 30;

/* ------------------------------------------------------------------ PINs */

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const key = await scryptAsync(pin, salt, KEYLEN);
  return `${salt}:${key.toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const [salt, keyHex] = stored.split(":");
  if (!salt || !keyHex) return false;

  const expected = Buffer.from(keyHex, "hex");
  const actual = await scryptAsync(pin, salt, KEYLEN);

  // Lengths must match before timingSafeEqual, which throws otherwise.
  return (
    expected.length === actual.length && timingSafeEqual(expected, actual)
  );
}

/* -------------------------------------------------------------- sessions */

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET must be set in production. Render generates one from render.yaml.",
    );
  }
  // Development only. A fixed value keeps you logged in across restarts.
  return "unnati-dev-secret-not-for-production";
}

/**
 * Session cookies are `userId.expiry.hmac`. Signed rather than encrypted: the contents
 * are not secret, they just must not be forgeable.
 */
function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: string): string {
  const expiry = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${userId}.${expiry}`;
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [userId, expiry, mac] = parts;
  const expected = sign(`${userId}.${expiry}`);

  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expiry) < Date.now()) return null;

  return userId;
}

export async function setSession(userId: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Safe to call from any Server Component. */
export async function currentUser(): Promise<User | null> {
  const jar = await cookies();
  const userId = readSessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!userId) return null;

  const db = await getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user ?? null;
}

/** Like `currentUser`, but throws — for API routes that have no business proceeding. */
export async function requireUser(role?: User["role"]): Promise<User> {
  const user = await currentUser();
  if (!user) throw new AuthError("Not signed in", 401);
  if (role && user.role !== role && user.role !== "ADMIN") {
    throw new AuthError(`This action is for ${role.toLowerCase()}s`, 403);
  }
  return user;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
