import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth";
import { ask } from "@/lib/assistant";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const schema = z.object({
  question: z.string().min(1).max(400),
});

/**
 * Ask the assistant.
 *
 * Scoped to the signed-in user, because most of what it answers is theirs — their
 * bookings, their ledger, the mandis near their own location. It is not a public
 * chatbot and there is nothing here to ask anonymously.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Ask me something in a sentence or two." },
        { status: 400 },
      );
    }

    const answer = await ask(parsed.data.question, user, user.language);
    return NextResponse.json(answer);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "I could not answer that just now. Try again in a moment." },
      { status: 500 },
    );
  }
}
