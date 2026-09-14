import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { verifyPin, setSession } from "@/lib/auth";

const schema = z.object({
  phone: z.string().regex(/^\d{10}$/, "Enter a 10-digit mobile number"),
  pin: z.string().regex(/^\d{4}$/, "Enter your 4-digit PIN"),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const db = await getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.phone, parsed.data.phone))
    .limit(1);

  // One message for both "no such number" and "wrong PIN": saying which is wrong
  // tells an attacker which numbers are registered.
  const ok = user && (await verifyPin(parsed.data.pin, user.pinHash));
  if (!ok) {
    return NextResponse.json(
      { error: "That number and PIN do not match." },
      { status: 401 },
    );
  }

  await setSession(user.id);

  return NextResponse.json({
    redirect:
      user.role === "OPERATOR"
        ? "/operator"
        : user.role === "ADMIN"
          ? "/admin"
          : "/farmer",
  });
}
