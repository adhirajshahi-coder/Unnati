/**
 * Sending an email.
 *
 * One provider, Resend, over plain `fetch` — no SDK, because the request is four lines
 * and a dependency that wraps four lines is a dependency to keep updated forever.
 *
 * Configure with:
 *   RESEND_API_KEY   from resend.com
 *   EMAIL_FROM       a verified sender, e.g. "UNNATI <noreply@yourdomain.in>"
 *   APP_URL          the public address, used to build links people click
 *
 * With none of these set, nothing is sent and the message is written to the server log
 * instead — the same decision the WhatsApp side makes, and for the same reason. A pilot
 * without a verified sending domain still needs to work, and a reset link visible in
 * the log is worth far more to whoever is running it than one that silently vanished.
 */

export interface SendMailResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** Public base address, without a trailing slash. */
export function appUrl(): string {
  const raw =
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3100";
  return raw.replace(/\/+$/, "");
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<SendMailResult> {
  if (!emailConfigured()) {
    console.warn(
      `[email] not configured — would have sent to ${opts.to}\n` +
        `        subject: ${opts.subject}\n` +
        opts.text.replace(/^/gm, "        "),
    );
    return { ok: false, skipped: true, error: "Email is not configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [opts.to],
        subject: opts.subject,
        text: opts.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("[email] send failed", res.status, body);
      return { ok: false, error: `Provider returned ${res.status}` };
    }

    return { ok: true };
  } catch (err) {
    console.error("[email] send threw", err);
    return { ok: false, error: err instanceof Error ? err.message : "failed" };
  }
}
