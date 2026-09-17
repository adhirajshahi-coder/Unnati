import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, AuthError } from "@/lib/auth";
import { setOptIn, whatsappConfigured } from "@/lib/whatsapp";
import { dispatchWhatsapp } from "@/lib/whatsapp";
import { toWaId } from "@/lib/whatsapp/client";

const schema = z.object({
  optIn: z.boolean(),
  /** A different WhatsApp number from the login one; blank clears it. */
  whatsappNumber: z.string().max(20).optional(),
});

/**
 * Turn WhatsApp alerts on or off.
 *
 * Consent is per-user and reversible from inside the app as well as by replying STOP
 * on WhatsApp itself — Meta requires an easy way out, and a channel a farmer cannot
 * switch off is one they will end up blocking instead, which costs the number for
 * everyone.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

    const { optIn, whatsappNumber } = parsed.data;
    const trimmed = whatsappNumber?.trim();

    if (optIn && trimmed) {
      if (!toWaId(trimmed)) {
        return NextResponse.json(
          { error: "That does not look like an Indian mobile number." },
          { status: 400 },
        );
      }
    }

    await setOptIn(
      user.id,
      optIn,
      trimmed ? trimmed : whatsappNumber !== undefined ? null : undefined,
    );

    // Confirm on the channel itself. It proves the number reaches them before any
    // alert they actually need depends on it, and it is the template Meta expects a
    // business to open a conversation with.
    if (optIn) {
      await dispatchWhatsapp({
        userId: user.id,
        notifType: "WELCOME",
        params: [user.name.split(" ")[0]],
      });
    }

    return NextResponse.json({
      ok: true,
      optIn,
      configured: whatsappConfigured(),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: "Could not change your WhatsApp setting." },
      { status: 400 },
    );
  }
}
