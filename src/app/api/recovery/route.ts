import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireUser, AuthError } from "@/lib/auth";
import { normaliseDob } from "@/lib/pinreset";

export const dynamic = "force-dynamic";

const schema = z.object({
  dateOfBirth: z.string().max(12),
  email: z.string().max(120),
});

/**
 * Saving the two details that let someone back into their own account.
 *
 * Both are optional and an empty string clears one — a farmer who has decided that
 * storing a birth date is not worth the risk has to be able to take it back out.
 *
 * Email is held to being unique across accounts. Two accounts sharing one address
 * would make the emailed reset ambiguous, and the ambiguity resolves in favour of
 * whoever asks first, which is a way to take someone else's account rather than a
 * rough edge.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Check what you typed.", errorHi: "जो लिखा है उसे जाँचिए।" },
        { status: 400 },
      );
    }

    const rawDob = parsed.data.dateOfBirth.trim();
    const rawEmail = parsed.data.email.trim().toLowerCase();

    let dateOfBirth: string | null = null;
    if (rawDob) {
      dateOfBirth = normaliseDob(rawDob);
      if (!dateOfBirth) {
        return NextResponse.json(
          {
            error: "Write the date as 05/08/1974.",
            errorHi: "तारीख़ ऐसे लिखिए: 05/08/1974",
          },
          { status: 400 },
        );
      }
    }

    let email: string | null = null;
    if (rawEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        return NextResponse.json(
          {
            error: "That does not look like an email address.",
            errorHi: "यह ईमेल पता सही नहीं लग रहा।",
          },
          { status: 400 },
        );
      }

      const db = await getDb();
      const [taken] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, rawEmail), ne(users.id, user.id)))
        .limit(1);

      if (taken) {
        return NextResponse.json(
          {
            error: "That email is already on another account.",
            errorHi: "यह ईमेल किसी और खाते पर पहले से दर्ज है।",
          },
          { status: 409 },
        );
      }

      email = rawEmail;
    }

    const db = await getDb();
    await db
      .update(users)
      .set({ dateOfBirth, email })
      .where(eq(users.id, user.id));

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[recovery] save failed", err);
    return NextResponse.json(
      { error: "Could not save that.", errorHi: "सहेजा नहीं जा सका।" },
      { status: 500 },
    );
  }
}
