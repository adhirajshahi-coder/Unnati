import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { hashPin, setSession } from "@/lib/auth";

const schema = z.object({
  phone: z.string().regex(/^\d{10}$/, "Enter a 10-digit mobile number"),
  pin: z.string().regex(/^\d{4}$/, "Choose a 4-digit PIN"),
  name: z.string().min(2, "Enter your name"),
  village: z.string().min(2, "Enter your village"),
  role: z.enum(["FARMER", "OPERATOR"]),
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
  const db = await getDb();

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
