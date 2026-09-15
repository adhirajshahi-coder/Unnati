/**
 * App chrome: the masthead and the bottom bar.
 *
 * Navigation sits at the bottom because this is used one-handed on a phone, standing
 * in a field. Every destination carries a drawn icon and a word — an icon alone can be
 * guessed the wrong way, a word alone excludes anyone reading slowly, and the pair
 * lets each cover for the other.
 *
 * The chrome is kept deliberately thin. The masthead and the bar together were taking
 * 44% of an 812px screen before content began, which is a lot of furniture to carry on
 * every one of forty screens. The tagline now appears once, on the landing page where
 * it introduces the product, rather than under the wordmark forever after.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import type { User } from "@/db/schema";
import { Icon, type IconName } from "@/components/Icon";

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
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 pt-2.5 pb-1.5">
        <Link href={homeFor(user.role)} className="min-w-0 flex-1">
          <span className="block font-display text-[21px] font-700 leading-none tracking-[0.06em]">
            {t("appName", lang)}
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-1.5">
          {/*
            Help is quiet and alerts are loud, which is the right way round: an unread
            alert is the app asking for attention, help is the farmer asking for it.
            Help used to be the solid green block here and out-shouted everything.
          */}
          <Link
            href="/help"
            aria-label={t("instantHelp", lang)}
            className="flex h-10 w-10 items-center justify-center rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] text-[var(--color-ink-2)]"
          >
            <Icon name="help" size={20} />
          </Link>

          <Link
            href="/notifications"
            aria-label={
              unread > 0
                ? `${t("notifications", lang)} (${unread})`
                : t("notifications", lang)
            }
            className={`relative flex h-10 w-10 items-center justify-center rounded-[3px] border ${
              unread > 0
                ? "border-[var(--color-keep)] bg-[var(--color-keep)] text-[var(--color-paper-2)]"
                : "border-[var(--color-rule-strong)] bg-[var(--color-paper)] text-[var(--color-ink-2)]"
            }`}
          >
            <Icon name="bell" size={20} />
            {unread > 0 && (
              <span className="tnum absolute -right-1.5 -top-1.5 min-w-[19px] rounded-full border border-[var(--color-paper-2)] bg-[var(--color-lose)] px-1 text-center text-[11px] font-600 leading-[17px] text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>

          <LangToggle lang={lang} />
        </div>
      </div>

      {/*
        Identity stays visible: field agents routinely help a farmer sign in on a
        borrowed handset, and "whose account is this" is a real question in that
        moment. It just does not need a second bordered row to say it.
      */}
      <div className="mx-auto flex max-w-3xl items-baseline justify-between gap-2 px-4 pb-1.5">
        <span className="truncate text-[12px] text-[var(--color-ink-3)]">
          {user.name}
          {user.village ? ` · ${user.village}` : ""}
        </span>
        <form action="/api/auth/logout" method="post">
          <button
            type="submit"
            className="min-h-0 shrink-0 text-[12px] underline decoration-dotted underline-offset-2 text-[var(--color-ink-3)]"
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
        aria-label={next === "hi" ? "हिन्दी में बदलें" : "Switch to English"}
        className="h-10 rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-2.5 font-body text-[13px] font-500"
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

interface NavItem {
  href: string;
  icon: IconName;
  label: string;
  key: string;
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
  // Labels are single words on purpose. "Nearby mandis" wrapped to two lines while its
  // neighbours did not, leaving the bar ragged and taller than it needed to be — and
  // the icon already carries "nearby".
  const items: NavItem[] =
    user.role === "OPERATOR"
      ? [
          { href: "/operator", icon: "home", label: t("home", lang), key: "home" },
          { href: "/operator/trucks", icon: "truck", label: t("trucks", lang), key: "trucks" },
          { href: "/mandis", icon: "mandi", label: t("mandis", lang), key: "mandis" },
          { href: "/connect", icon: "connect", label: t("connect", lang), key: "connect" },
        ]
      : user.role === "ADMIN"
        ? [
            { href: "/admin", icon: "home", label: t("dashboard", lang), key: "home" },
            { href: "/mandis", icon: "mandi", label: t("mandis", lang), key: "mandis" },
            { href: "/connect", icon: "connect", label: t("connect", lang), key: "connect" },
          ]
        : [
            { href: "/farmer", icon: "home", label: t("home", lang), key: "home" },
            { href: "/farmer/sell", icon: "sell", label: t("sell", lang), key: "sell" },
            { href: "/mandis", icon: "mandi", label: t("mandis", lang), key: "mandis" },
            { href: "/farmer/trips", icon: "truck", label: t("trips", lang), key: "trips" },
            { href: "/connect", icon: "connect", label: t("connect", lang), key: "connect" },
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
              className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11.5px] leading-none ${
                on
                  ? "bg-[var(--color-keep)] font-600 text-[var(--color-paper-2)]"
                  : "text-[var(--color-ink-2)]"
              }`}
            >
              <Icon name={item.icon} size={21} />
              <span className="truncate px-0.5">{item.label}</span>
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
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
        {children}
      </main>
      <BottomNav user={user} lang={lang} active={active} />
    </div>
  );
}
