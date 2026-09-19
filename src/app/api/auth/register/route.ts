import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { hashPin, setSession } from "@/lib/auth";
import { normaliseDob, validEmail } from "@/lib/pinreset";

const schema = z.object({
  phone: z.string().regex(/^\d{10}$/, "Enter a 10-digit mobile number"),
  pin: z.string().regex(/^\d{4}$/, "Choose a 4-digit PIN"),
  name: z.string().min(2, "Enter your name"),
  village: z.string().min(2, "Enter your village"),
  role: z.enum(["FARMER", "OPERATOR"]),

  /*
   * Recovery details, collected here because this is the only moment the farmer is
   * certain to be sitting with someone who can help them fill it in. Asking later, in
   * settings, means asking someone who has no reason to go looking — and the person
   * who never went looking is exactly the person who is locked out in six months.
   *
   * Both optional. Most farmers have no email, and a required field would be filled
   * with something false, which is worse than empty: a false address is a recovery
   * route that appears to exist and does not.
   */
  dateOfBirth: z.string().max(12).optional().default(""),
  email: z.string().max(120).optional().default(""),
});

/**
 * Registration without an OTP.
 *
 * A production deployment must verify the number by SMS before creating the account —
 * without it, anyone can register any phone number. The gateway is a deployment-time
 * dependency (PDD §10 lists it as an assumption), so the seam is here and nothing
 * else has to change when it is wired in.
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const { phone, pin, name, village, role } = parsed.data;

  const rawDob = parsed.data.dateOfBirth.trim();
  const dateOfBirth = rawDob ? normaliseDob(rawDob) : null;
  if (rawDob && !dateOfBirth) {
    return NextResponse.json(
      { error: "Write the date of birth as 05/08/1974." },
      { status: 400 },
    );
  }

  const rawEmail = parsed.data.email.trim().toLowerCase();
  if (rawEmail && !validEmail(rawEmail)) {
    return NextResponse.json(
      { error: "That does not look like an email address." },
      { status: 400 },
    );
  }
  const email = rawEmail || null;
  const db = await getDb();

  // One address per account. Two accounts sharing one would make the emailed reset
  // ambiguous, and it would resolve in favour of whoever asked first — a way to take
  // someone else's account rather than a rough edge.
  if (email) {
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (taken) {
      return NextResponse.json(
        { error: "That email is already on another account." },
        { status: 409 },
      );
    }
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, phone))
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { error: "That number is already registered. Sign in instead." },
      { status: 409 },
    );
  }

  // Pilot region default. A real deployment reads this from the handset's location
  // with the farmer's consent; PRD §8 is explicit that location is used only for
  // matching, so it is collected at the point it is needed and not before.
  const [user] = await db
    .insert(users)
    .values({
      phone,
      pinHash: await hashPin(pin),
      name,
      village,
      role,
      dateOfBirth,
      email,
      language: "hi",
      district: "Nashik",
      state: "Maharashtra",
      lat: 20.0806,
      lng: 74.1103,
    })
    .returning();

  await setSession(user.id);

  return NextResponse.json({
    redirect: role === "OPERATOR" ? "/operator" : "/farmer",
  });
}
