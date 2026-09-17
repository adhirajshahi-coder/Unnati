import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { whatsappMessages } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications";
import { whatsappConfigured } from "@/lib/whatsapp";
import { Page } from "@/components/Shell";
import { SlipHeading } from "@/components/Slip";
import { WhatsappOptIn } from "@/components/WhatsappOptIn";
import { LocationPicker } from "@/components/LocationPicker";
import { DEFAULT_LOCATIONS } from "@/data/mandis";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Settings: how this person is reached, and where they are.
 *
 * Both roles get the same page. A truck operator needs a payment reminder and a "your
 * group is ready" alert on WhatsApp every bit as much as a farmer does — arguably more,
 * since they are out on the road rather than near a handset charger.
 */
export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/");

  const db = await getDb();
  const lang = user.language;
  const unread = await unreadCount(user.id);

  // Their own last few messages, so the setting is verifiable rather than a promise.
  const recent = await db
    .select({
      id: whatsappMessages.id,
      direction: whatsappMessages.direction,
      body: whatsappMessages.body,
      status: whatsappMessages.status,
      createdAt: whatsappMessages.createdAt,
    })
    .from(whatsappMessages)
    .where(eq(whatsappMessages.userId, user.id))
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(6);

  const STATUS: Record<string, { en: string; hi: string }> = {
    QUEUED: { en: "queued", hi: "कतार में" },
    SENT: { en: "sent", hi: "भेजा गया" },
    DELIVERED: { en: "delivered", hi: "पहुँचा" },
    READ: { en: "read", hi: "पढ़ा गया" },
    FAILED: { en: "failed", hi: "नहीं गया" },
    SKIPPED: { en: "not sent", hi: "नहीं भेजा" },
  };

  return (
    <Page user={user} lang={lang} active="settings" unread={unread}>
      <WhatsappOptIn
        lang={lang}
        optedIn={user.whatsappOptIn}
        phone={user.phone}
        whatsappNumber={user.whatsappNumber}
        configured={whatsappConfigured()}
      />

      <LocationPicker
        lang={lang}
        current={{
          village: user.village,
          district: user.district,
          state: user.state,
        }}
        options={DEFAULT_LOCATIONS}
      />

      {recent.length > 0 && (
        <section className="mb-5">
          <SlipHeading>
            {lang === "hi" ? "पिछले संदेश" : "Recent messages"}
          </SlipHeading>
          <ul className="mt-1">
            {recent.map((m) => (
              <li
                key={m.id}
                className="border-b border-dotted border-[var(--color-rule)] py-2"
              >
                <p className="text-[13.5px] leading-snug">{m.body}</p>
                <p className="tnum mt-0.5 text-[11.5px] text-[var(--color-ink-3)]">
                  {m.direction === "INBOUND"
                    ? lang === "hi"
                      ? "आपने भेजा"
                      : "you sent"
                    : (STATUS[m.status]?.[lang] ?? m.status)}{" "}
                  ·{" "}
                  {new Date(m.createdAt).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-center">
        <Link
          href="/help"
          className="text-[14px] underline decoration-dotted underline-offset-2 text-[var(--color-keep)]"
        >
          {t("instantHelp", lang)}
        </Link>
      </p>
    </Page>
  );
}
