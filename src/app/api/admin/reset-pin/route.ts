import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomInt } from "node:crypto";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireUser, AuthError, hashPin } from "@/lib/auth";
import { notify } from "@/lib/notifications";

export const dynamic = "force-dynamic";

const schema = z.object({
  phone: z.string().regex(/^\d{10}$/, "Enter a 10-digit mobile number"),
});

/**
 * Reset a farmer's PIN.
 *
 * There is no self-service reset, and that is a deliberate limit rather than an
 * oversight: proving who you are without one needs an OTP channel, and the number a
 * farmer would receive it on is the same number someone standing next to them could
 * read. So a reset is a human decision — a field agent or the ops desk, who knows the
 * farmer or can call them back on the registered number.
 *
 * Three choices in how it works:
 *
 *   - The new PIN is **generated, not chosen**. An agent resetting fifty accounts will
 *     otherwise set 1234 on all fifty, and a PIN everybody knows is not a PIN.
 *   - It is returned **once**, to the admin who asked, and never stored in readable
 *     form — only its scrypt hash goes to the database, the same as any other PIN.
 *   - The farmer is told it happened, in their own alerts. The notification carries no
 *     PIN, because an alert list is not a place to keep a credential; it exists so a
 *     reset nobody asked for is visible to the person it happened to.
 */
export async function POST(req: Request) {
  try {
    await requireUser("ADMIN");

    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const db = await getDb();
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        village: users.village,
        role: users.role,
      })
      .from(users)
      .where(eq(users.phone, parsed.data.phone))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: "No account is registered on that number." },
        { status: 404 },
      );
    }

    // randomInt, not Math.random: a predictable PIN is worse than no reset at all.
    const pin = String(randomInt(1000, 10000));

    await db
      .update(users)
      .set({ pinHash: await hashPin(pin) })
      .where(eq(users.id, user.id));

    await notify({
      userId: user.id,
      type: "SYSTEM",
      title: "Your PIN was reset",
      body: "The UNNATI team reset your PIN. If you did not ask for this, tell your field agent.",
      titleHi: "आपका पिन बदल दिया गया",
      bodyHi: "उन्नति टीम ने आपका पिन बदला है। अगर आपने नहीं कहा था, तो अपने फ़ील्ड एजेंट को बताइए।",
    });

    return NextResponse.json({
      pin,
      name: user.name,
      village: user.village,
      role: user.role,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin] PIN reset failed", err);
    return NextResponse.json(
      { error: "Could not reset that PIN." },
      { status: 500 },
    );
  }
}
