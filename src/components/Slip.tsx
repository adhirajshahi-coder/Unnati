/**
 * The mandi patti — the ruled paper slip the whole interface is built on.
 *
 * Every figure a farmer is shown appears as a line item on one of these, because the
 * product's promise is that nothing is hidden and this is the artifact that already
 * means exactly that to the person reading it.
 */
import type { ReactNode } from "react";

export function Slip({
  children,
  className = "",
  lifted = false,
}: {
  children: ReactNode;
  className?: string;
  lifted?: boolean;
}) {
  return (
    <div
      className={`slip px-4 py-5 sm:px-6 ${
        lifted ? "shadow-[0_10px_28px_-14px_rgba(26,29,26,0.45)]" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** A ruled line item: label on the left, figure on the right, dotted rule between. */
export function Line({
  label,
  sub,
  value,
  tone = "neutral",
  strong = false,
  index,
}: {
  label: string;
  sub?: string;
  value: ReactNode;
  tone?: "neutral" | "keep" | "lose" | "pool";
  strong?: boolean;
  index?: number;
}) {
  const toneClass = {
    neutral: "text-ink",
    keep: "text-[var(--color-keep)]",
    lose: "text-[var(--color-lose)]",
    pool: "text-[var(--color-pool)]",
  }[tone];

  return (
    <div
      className="rule-row print-in"
      style={index !== undefined ? ({ "--i": index } as React.CSSProperties) : undefined}
    >
      <span className="min-w-0">
        <span
          className={`block text-[15px] leading-tight ${
            strong ? "font-semibold" : ""
          } text-ink`}
        >
          {label}
        </span>
        {sub && (
          <span className="block text-[12.5px] leading-tight text-[var(--color-ink-3)]">
            {sub}
          </span>
        )}
      </span>
      <span
        className={`tnum shrink-0 ${
          strong ? "text-lg font-semibold" : "text-[15px]"
        } ${toneClass}`}
      >
        {value}
      </span>
    </div>
  );
}

/** Section heading inside a slip — the small-caps rubric on a printed form. */
export function SlipHeading({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3 border-b-2 border-[var(--color-rule-strong)] pb-1.5">
      <h2 className="font-display text-[13px] font-700 uppercase tracking-[0.14em] text-[var(--color-ink-2)]">
        {children}
      </h2>
      {right && (
        <span className="tnum text-[12px] text-[var(--color-ink-3)]">
          {right}
        </span>
      )}
    </div>
  );
}

/**
 * The stamped total. The one rotated element in the app: an APMC seal is applied by
 * hand and never lands square, which is what makes it read as a stamp rather than as
 * a heading with a border.
 */
export function Stamp({
  label,
  value,
  tone = "keep",
}: {
  label: string;
  value: string;
  tone?: "keep" | "lose";
}) {
  return (
    <div
      className={`stamp ${tone === "lose" ? "stamp-lose" : ""} inline-block px-4 py-2 text-center`}
    >
      <div className="font-display text-[10px] font-700 uppercase tracking-[0.2em] opacity-80">
        {label}
      </div>
      <div className="tnum text-[26px] font-600 leading-tight">{value}</div>
    </div>
  );
}
