import { NextResponse } from "next/server";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { users, notifications } from "@/db/schema";
import { notify } from "@/lib/notifications";

export const dynamic = "force-dynamic";

const schema = z.object({
  phone: z.string().regex(/^\d{10}$/, "Enter a 10-digit mobile number"),
});

/** How long before the same number can raise a second request. */
const COOLDOWN_MS = 6 * 60 * 60 * 1000;

/**
 * "I have forgotten my PIN", from the sign-in screen.
 *
 * This deliberately does not reset anything. The person asking is, by definition, not
 * signed in and has proved nothing — and the only channel we could send a code to is
 * the handset someone standing next to them is holding. So it raises a request, and a
 * human at the ops desk calls the registered number back and resets it there.
 *
 * Two things this route has to get right, both of them about a stranger:
 *
 *   - **It never says whether a number is registered.** The reply is identical either
 *     way. Otherwise this becomes a free tool for checking which numbers in a village
 *     have an account — which is exactly what the sign-in route already refuses to
 *     leak, and it would be pointless to guard one door and leave the other open.
 *   - **It cannot be used to flood the ops desk.** One request per number every six
 *     hours; a second inside that window is accepted, and quietly does nothing.
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));

  // Even a malformed number gets the neutral answer rather than a validation error:
  // the difference between the two is itself a signal.
  if (!parsed.success) return neutral();

  try {
    const db = await getDb();

    const [user] = await db
      .select({ id: users.id, name: users.name, village: users.village, role: users.role })
      .from(users)
      .where(eq(users.phone, parsed.data.phone))
      .limit(1);

    if (!user) return neutral();

    const [recent] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, user.id),
          eq(notifications.type, "SYSTEM"),
          gt(notifications.createdAt, new Date(Date.now() - COOLDOWN_MS)),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(1);

    if (recent) return neutral();

    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "ADMIN"));

    const who = `${user.name}${user.village ? `, ${user.village}` : ""}`;

    for (const admin of admins) {
      await notify({
        userId: admin.id,
        type: "SYSTEM",
        title: `PIN reset asked for: ${parsed.data.phone}`,
        body: `${who} (${user.role.toLowerCase()}) cannot sign in. Call that number back, then reset the PIN from the dashboard.`,
        titleHi: `पिन बदलने का अनुरोध: ${parsed.data.phone}`,
        bodyHi: `${who} लॉग इन नहीं कर पा रहे। उसी नंबर पर वापस कॉल कीजिए, फिर डैशबोर्ड से पिन बदल दीजिए।`,
        href: "/admin",
      });
    }

    // The person who asked is told too, so the request is visible to them the moment
    // they get back in — and so an attempt nobody made does not pass unnoticed.
    await notify({
      userId: user.id,
      type: "SYSTEM",
      title: "PIN help requested",
      body: "Someone asked for help signing in to this account. The UNNATI team will call this number.",
      titleHi: "पिन में मदद माँगी गई",
      bodyHi: "इस खाते में लॉग इन की मदद माँगी गई है। उन्नति टीम इसी नंबर पर कॉल करेगी।",
    });

    return neutral();
  } catch (err) {
    console.error("[auth] pin help failed", err);
    // Still neutral: an error here must not become a way to tell numbers apart.
    return neutral();
  }
}

function neutral() {
  return NextResponse.json({
    message:
      "If that number is registered, the UNNATI team will call it and set a new PIN.",
    messageHi:
      "अगर यह नंबर दर्ज है, तो उन्नति टीम इसी नंबर पर कॉल करके नया पिन देगी।",
  });
}
