import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { inbox, markAllRead, BILLING_NOTICE_DAYS } from "@/lib/notifications";
import { Page } from "@/components/Shell";
import { SlipHeading } from "@/components/Slip";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * The alert inbox.
 *
 * Only notifications whose scheduled time has arrived appear — a billing reminder
 * written today for a bill due in three weeks is a promise, not a message, and showing
 * it early would make the seven-day rule meaningless.
 */
export default async function NotificationsPage() {
  const user = await currentUser();
  if (!user) redirect("/");

  const items = await inbox(user.id);
  const lang = user.language;

  // Opening the inbox is what marks it read, so the badge clears on the way in.
  await markAllRead(user.id);

  const CHANNEL: Record<string, { en: string; hi: string }> = {
    SMS: { en: "SMS", hi: "एसएमएस" },
    IVR: { en: "Voice call", hi: "वॉइस कॉल" },
    PUSH: { en: "App", hi: "ऐप" },
    IN_APP: { en: "App", hi: "ऐप" },
  };

  const TYPE_TONE: Record<string, string> = {
    PRICE_ALERT: "var(--color-keep)",
    POOLING_ALERT: "var(--color-pool)",
    BILLING_REMINDER: "var(--color-lose)",
    SPOILAGE_WARNING: "var(--color-lose)",
    TRIP_UPDATE: "var(--color-keep)",
    SYSTEM: "var(--color-ink-3)",
  };

  return (
    <Page user={user} lang={lang} active="alerts" unread={0}>
      <SlipHeading right={`${items.length}`}>
        {t("notifications", lang)}
      </SlipHeading>

      {items.length === 0 ? (
        <p className="py-10 text-center text-[15px] text-[var(--color-ink-3)]">
          {t("noAlerts", lang)}
        </p>
      ) : (
        <ul className="mt-1">
          {items.map((n, i) => {
            const title = lang === "hi" && n.titleHi ? n.titleHi : n.title;
            const body = lang === "hi" && n.bodyHi ? n.bodyHi : n.body;
            const inner = (
              <div
                className="print-in border-b border-dotted border-[var(--color-rule)] py-3"
                style={{ "--i": i } as React.CSSProperties}
              >
                <div className="flex items-baseline gap-2">
                  <span
                    aria-hidden
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: TYPE_TONE[n.type] }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-500 leading-snug">
                      {title}
                    </span>
                    <span className="mt-0.5 block text-[13.5px] leading-snug text-[var(--color-ink-2)]">
                      {body}
                    </span>
                    <span className="tnum mt-1 block text-[11.5px] text-[var(--color-ink-3)]">
                      {CHANNEL[n.channel]?.[lang] ?? n.channel} ·{" "}
                      {new Date(n.scheduledFor).toLocaleString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                </div>
              </div>
            );

            return (
              <li key={n.id}>
                {n.href ? <Link href={n.href}>{inner}</Link> : inner}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-[12px] leading-snug text-[var(--color-ink-3)]">
        {lang === "hi"
          ? `भुगतान की याद हर बार देय तिथि से ${BILLING_NOTICE_DAYS} दिन पहले भेजी जाती है। कम नेटवर्क वाले इलाकों में यह SMS या वॉइस कॉल से भी जाती है।`
          : `Payment reminders are always sent ${BILLING_NOTICE_DAYS} days before the due date, by SMS or voice call where the app cannot reach you.`}
      </p>
    </Page>
  );
}
