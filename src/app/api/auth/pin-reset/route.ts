import { NextResponse } from "next/server";
import { z } from "zod";
import {
  resetByDob,
  resetByToken,
  issueEmailToken,
  LOCKOUT_MS,
  MAX_ATTEMPTS,
} from "@/lib/pinreset";
import { sendMail, appUrl, emailConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";

const dobSchema = z.object({
  method: z.literal("dob"),
  phone: z.string().regex(/^\d{10}$/),
  dob: z.string().min(6).max(12),
  newPin: z.string().regex(/^\d{4}$/),
});

const emailSchema = z.object({
  method: z.literal("email"),
  identifier: z.string().min(3).max(120),
});

const tokenSchema = z.object({
  method: z.literal("token"),
  token: z.string().min(20).max(200),
  newPin: z.string().regex(/^\d{4}$/),
});

const schema = z.discriminatedUnion("method", [
  dobSchema,
  emailSchema,
  tokenSchema,
]);

/**
 * Resetting a forgotten PIN.
 *
 * Three shapes on one route because they are one decision — which proof was offered —
 * and splitting them across three files would let the answers drift apart. The answers
 * matter as much as the logic here: every failure that could reveal whether a number
 * is registered returns the same words, and only the two that cannot say anything
 * about an account — a badly formed PIN, and a lockout the caller already triggered —
 * are reported as themselves.
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: badInput }, { status: 400 });
  }

  const input = parsed.data;

  /* --------------------------------------------------- date of birth */
  if (input.method === "dob") {
    const result = await resetByDob({
      phone: input.phone,
      dob: input.dob,
      newPin: input.newPin,
    });

    if (result.ok) {
      return NextResponse.json({
        ok: true,
        message: "PIN changed. Sign in with your new PIN.",
        messageHi: "पिन बदल गया। नए पिन से लॉग इन कीजिए।",
      });
    }

    if (result.reason === "bad-pin") {
      return NextResponse.json({ error: badInput }, { status: 400 });
    }

    if (result.reason === "locked") {
      return NextResponse.json(
        {
          error: `Too many wrong answers. Try again in ${Math.round(LOCKOUT_MS / 60000)} minutes, or ask your field agent.`,
          errorHi: `बहुत बार ग़लत जवाब। ${Math.round(LOCKOUT_MS / 60000)} मिनट बाद कोशिश कीजिए, या फ़ील्ड एजेंट से कहिए।`,
        },
        { status: 429 },
      );
    }

    // Unregistered number, no date of birth on file, and a wrong date all land here
    // with one message. Telling them apart is exactly what an attacker wants.
    return NextResponse.json(
      {
        error: `That number and date of birth do not match. ${MAX_ATTEMPTS} wrong answers will lock recovery for a while.`,
        errorHi: `यह नंबर और जन्मतिथि मेल नहीं खाते। ${MAX_ATTEMPTS} बार ग़लत होने पर कुछ देर के लिए बंद हो जाएगा।`,
      },
      { status: 401 },
    );
  }

  /* ---------------------------------------------------------- email */
  if (input.method === "email") {
    const issued = await issueEmailToken(input.identifier);

    if (issued) {
      const link = `${appUrl()}/reset?token=${encodeURIComponent(issued.token)}`;
      await sendMail({
        to: issued.email,
        subject: "UNNATI — set a new PIN",
        text:
          `${issued.name},\n\n` +
          "Someone asked to set a new PIN for your UNNATI account. Open this link to choose one:\n\n" +
          `${link}\n\n` +
          "The link works once and expires in 30 minutes.\n\n" +
          "If you did not ask for this, ignore this email — your PIN has not changed.\n\n" +
          "UNNATI\n",
      });
    }

    // Identical whether or not an account was found, or an email was on it, or the
    // provider accepted it.
    return NextResponse.json({
      ok: true,
      message:
        "If an account with that email exists, a link to set a new PIN is on its way. It expires in 30 minutes.",
      messageHi:
        "अगर उस ईमेल से कोई खाता है, तो नया पिन बनाने का लिंक भेज दिया गया है। लिंक 30 मिनट तक चलेगा।",
      configured: emailConfigured(),
    });
  }

  /* ---------------------------------------------------------- token */
  const result = await resetByToken(input.token, input.newPin);

  if (result.ok) {
    return NextResponse.json({
      ok: true,
      message: "PIN changed. Sign in with your new PIN.",
      messageHi: "पिन बदल गया। नए पिन से लॉग इन कीजिए।",
    });
  }

  if (result.reason === "bad-pin") {
    return NextResponse.json({ error: badInput }, { status: 400 });
  }

  return NextResponse.json(
    {
      error: "This link has expired or has already been used. Ask for a new one.",
      errorHi: "यह लिंक पुराना हो गया या पहले ही इस्तेमाल हो चुका है। नया लिंक माँगिए।",
    },
    { status: 401 },
  );
}

const badInput = "Enter a 4-digit PIN, and check what you typed.";
