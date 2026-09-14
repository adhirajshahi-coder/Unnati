/**
 * App chrome: the masthead and the bottom bar.
 *
 * Navigation sits at the bottom because this is used one-handed on a phone, standing
 * in a field. Every destination carries an icon and a word — icons alone are guessable
 * in the wrong direction, words alone exclude anyone reading slowly.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { User } from "@/db/schema";

function Icon({ name }: { name: string }) {
  // Inline glyph set. Kept as text so it inherits colour and scales with the type,
  // and so the app ships no icon-font request on a 2G connection.
  const glyphs: Record<string, string> = {
    home: "⌂",
    mandi: "⌗",
    sell: "₹",
    trips: "⇨",
    money: "▤",
    bell: "◔",
    truck: "▤",
    users: "◍",
  };
  return (
    <span aria-hidden className="block text-[19px] leading-none">
      {glyphs[name] ?? "•"}
    </span>
  );
}

export function Masthead({
  user,
  lang,
  unread = 0,
}: {
  user: User;
  lang: Lang;
  unread?: number;
}) {
  return (
    <header className="border-b-2 border-[var(--color-ink)] bg-[var(--color-paper-2)]">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link href={homeFor(user.role)} className="min-w-0">
          <div className="font-display text-[22px] font-700 leading-none tracking-[0.06em]">
            {t("appName", lang)}
          </div>
          <div className="truncate text-[11px] leading-tight text-[var(--color-ink-3)]">
            {t("tagline", lang)}
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/notifications"
            aria-label={t("notifications", lang)}
            className="relative flex h-11 w-11 items-center justify-center rounded border border-[var(--color-rule)] bg-[var(--color-paper)]"
          >
            <Icon name="bell" />
            {unread > 0 && (
              <span className="tnum absolute -right-1 -top-1 min-w-[20px] rounded-full bg-[var(--color-lose)] px-1 text-center text-[11px] font-600 leading-[20px] text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
          <LangToggle lang={lang} />
        </div>
      </div>

      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 border-t border-dotted border-[var(--color-rule)] px-4 py-1.5">
        <span className="truncate text-[12.5px] text-[var(--color-ink-2)]">
          {user.name}
          {user.village ? ` · ${user.village}` : ""}
        </span>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="min-h-0 text-[12.5px] underline decoration-dotted underline-offset-2 text-[var(--color-ink-3)]"
          >
            {t("signOut", lang)}
          </button>
        </form>
      </div>
    </header>
  );
}

function LangToggle({ lang }: { lang: Lang }) {
  const next: Lang = lang === "hi" ? "en" : "hi";
  return (
    <form action="/api/language" method="post">
      <input type="hidden" name="lang" value={next} />
      <button
        type="submit"
        className="h-11 rounded border border-[var(--color-rule)] bg-[var(--color-paper)] px-3 font-body text-[14px] font-500"
      >
        {next === "hi" ? "हिन्दी" : "EN"}
      </button>
    </form>
  );
}

function homeFor(role: User["role"]) {
  return role === "OPERATOR"
    ? "/operator"
    : role === "ADMIN"
      ? "/admin"
      : "/farmer";
}

export function BottomNav({
  user,
  lang,
  active,
}: {
  user: User;
  lang: Lang;
  active: string;
}) {
  const items =
    user.role === "OPERATOR"
      ? [
          { href: "/operator", icon: "home", label: t("dashboard", lang), key: "home" },
          { href: "/operator/trucks", icon: "truck", label: t("trucks", lang), key: "trucks" },
          { href: "/mandis", icon: "mandi", label: t("nearbyMandis", lang), key: "mandis" },
          { href: "/notifications", icon: "bell", label: t("notifications", lang), key: "alerts" },
        ]
      : user.role === "ADMIN"
        ? [
            { href: "/admin", icon: "home", label: t("dashboard", lang), key: "home" },
            { href: "/mandis", icon: "mandi", label: t("nearbyMandis", lang), key: "mandis" },
            { href: "/notifications", icon: "bell", label: t("notifications", lang), key: "alerts" },
          ]
        : [
            { href: "/farmer", icon: "home", label: t("home", lang), key: "home" },
            { href: "/farmer/sell", icon: "sell", label: t("sell", lang), key: "sell" },
            { href: "/mandis", icon: "mandi", label: t("nearbyMandis", lang), key: "mandis" },
            { href: "/farmer/trips", icon: "trips", label: t("myTrips", lang), key: "trips" },
            { href: "/farmer/earnings", icon: "money", label: t("earnings", lang), key: "earnings" },
          ];

  return (
    <nav className="sticky bottom-0 z-10 border-t-2 border-[var(--color-ink)] bg-[var(--color-paper-2)]">
      <div className="mx-auto flex max-w-3xl">
        {items.map((item) => {
          const on = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={on ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11.5px] ${
                on
                  ? "bg-[var(--color-keep)] font-600 text-[var(--color-paper-2)]"
                  : "text-[var(--color-ink-2)]"
              }`}
            >
              <Icon name={item.icon} />
              <span className="leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Page({
  user,
  lang,
  active,
  unread,
  children,
}: {
  user: User;
  lang: Lang;
  active: string;
  unread?: number;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Masthead user={user} lang={lang} unread={unread} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
        {children}
      </main>
      <BottomNav user={user} lang={lang} active={active} />
    </div>
  );
}
