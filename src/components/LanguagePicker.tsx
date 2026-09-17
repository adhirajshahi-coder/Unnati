/**
 * Choosing a language.
 *
 * Thirteen options will not fit in the two-way toggle this replaced, and a `<select>`
 * would hide twelve of them behind a tap on a low-end Android. So the masthead keeps a
 * button showing the current language *in its own script* — which is the only label
 * that means anything to someone who cannot read Latin — and opening it lists all
 * thirteen the same way.
 *
 * No client JavaScript. `<details>` opens the panel, and each row is its own form that
 * posts and reloads. On a handset where the bundle has not finished arriving over 2G,
 * the language switch still works, which matters more here than anywhere else in the
 * app: someone stuck in a language they cannot read needs this control to be the one
 * that is definitely working.
 */
import { LANGUAGES, languageMeta, type Lang } from "@/lib/languages";
import { t } from "@/lib/i18n";

export function LanguageButton({ lang }: { lang: Lang }) {
  const current = languageMeta(lang);

  return (
    <details className="relative">
      <summary
        aria-label={t("language", lang)}
        className="flex h-10 max-w-[5.5rem] cursor-pointer list-none items-center justify-center rounded-[3px] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-2.5 font-body text-[13px] font-500 [&::-webkit-details-marker]:hidden"
      >
        <span className="truncate">{current.native}</span>
      </summary>

      <div className="absolute right-0 top-[calc(100%+4px)] z-50 max-h-[62vh] w-[15rem] overflow-y-auto border-2 border-[var(--color-ink)] bg-[var(--color-paper-2)] shadow-[3px_3px_0_var(--color-rule-strong)]">
        <LanguageList lang={lang} />
      </div>
    </details>
  );
}

/**
 * The list itself, also used full-width in settings.
 *
 * Each row carries the language's own name large and where it is spoken small beneath,
 * both in that language's script. The second line is there for the case this whole
 * screen exists to handle — a field agent setting up a phone for someone else, reading
 * down a list of scripts they cannot read, looking for the one that says the right
 * state.
 */
export function LanguageList({ lang }: { lang: Lang }) {
  return (
    <ul>
      {LANGUAGES.map((l) => {
        const active = l.code === lang;
        return (
          <li
            key={l.code}
            className="border-b border-[var(--color-rule)] last:border-b-0"
          >
            <form action="/api/language" method="post">
              <input type="hidden" name="lang" value={l.code} />
              <button
                type="submit"
                dir={l.rtl ? "rtl" : "ltr"}
                aria-current={active ? "true" : undefined}
                className={`flex w-full items-baseline gap-2 px-3 py-2.5 text-start ${
                  active
                    ? "bg-[var(--color-keep)] text-[var(--color-paper-2)]"
                    : "text-[var(--color-ink)]"
                }`}
              >
                <span className="flex-1 text-[16px] font-500 leading-tight">
                  {l.native}
                </span>
                <span
                  className={`shrink-0 text-[11px] leading-tight ${
                    active ? "opacity-85" : "text-[var(--color-ink-3)]"
                  }`}
                >
                  {l.where}
                </span>
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
