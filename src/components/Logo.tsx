/**
 * The UNNATI mark.
 *
 * Drawn as inline SVG rather than shipped as a PNG, for the same reason every icon in
 * this app is: it renders on the first paint over 2G with no second request, it stays
 * sharp on a cheap 480p phone and on a laptop, and it costs about a kilobyte.
 *
 * Two pieces, used in different places, and the split is deliberate:
 *
 *   - `Logo` is the full lockup — wordmark, leaf, rising arrow and the banner carrying
 *     what the name stands for. It belongs on the landing page, where a brand gets one
 *     moment to introduce itself to someone who has never seen it.
 *   - `LogoMark` is the leaf and arrow alone. That is what goes in the masthead, next to
 *     the wordmark the app already renders *in the reader's own language*. A fixed Latin
 *     "UNNATI" in the chrome of all forty screens would undo that: an Urdu reader sees
 *     اُنّتی today, and should keep seeing it.
 *
 * The banner line is English only, which is the other reason it stays on the landing
 * page. "Unified Network for New-age Agriculture, Technology & Innovation" is a
 * backronym for investors and partners; it is not a sentence to put in front of a
 * farmer who reads slowly, on every screen, forever.
 */

const GREEN_DEEP = "#0d3b23";
const GREEN_MID = "#2e7d32";
const GREEN_BRIGHT = "#5cb82b";
const GOLD_LIGHT = "#ffd23f";
const GOLD_DEEP = "#e9a100";

/** Shared paint. Rendered once per logo instance; the ids are stable and identical. */
function Paint({ prefix }: { prefix: string }) {
  return (
    <defs>
      <linearGradient id={`${prefix}-green`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={GREEN_DEEP} />
        <stop offset="55%" stopColor={GREEN_MID} />
        <stop offset="100%" stopColor={GREEN_BRIGHT} />
      </linearGradient>
      <linearGradient id={`${prefix}-leaf`} x1="0" y1="1" x2="1" y2="0">
        <stop offset="0%" stopColor={GREEN_MID} />
        <stop offset="100%" stopColor={GREEN_BRIGHT} />
      </linearGradient>
      <linearGradient id={`${prefix}-gold`} x1="0" y1="1" x2="0.4" y2="0">
        <stop offset="0%" stopColor={GOLD_DEEP} />
        <stop offset="100%" stopColor={GOLD_LIGHT} />
      </linearGradient>

      {/*
        The rule under the banner needs its own paint in user space. A gradient in the
        default objectBoundingBox units is degenerate on a perfectly horizontal line —
        the box has zero height, so the browser draws nothing at all, which is exactly
        what happened the first time this was built.
      */}
      <linearGradient
        id={`${prefix}-rule`}
        gradientUnits="userSpaceOnUse"
        x1="96"
        y1="0"
        x2="564"
        y2="0"
      >
        <stop offset="0%" stopColor={GOLD_DEEP} stopOpacity="0" />
        <stop offset="28%" stopColor={GOLD_LIGHT} />
        <stop offset="72%" stopColor={GOLD_LIGHT} />
        <stop offset="100%" stopColor={GOLD_DEEP} stopOpacity="0" />
      </linearGradient>
    </defs>
  );
}

/**
 * The full lockup.
 *
 * The wordmark is live text in the app's own display face rather than outlined paths:
 * it stays selectable, it is read correctly by a screen reader without help, and it
 * cannot drift out of step with the typography around it. `textLength` pins its width
 * so the arrow always crowns the final I, whatever the browser does with metrics.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 660 252"
      className={className}
      role="img"
      aria-label="UNNATI — Unified Network for New-age Agriculture, Technology and Innovation"
    >
      <Paint prefix="ul" />

      <text
        x="42"
        y="150"
        textLength="574"
        lengthAdjust="spacing"
        style={{ fontFamily: "var(--font-display)" }}
        fontSize="140"
        fontWeight="700"
        fill="url(#ul-green)"
      >
        UNNATI
      </text>

      {/*
        The leaf sweeps in from the left and settles across the base of the letters, the
        way a growing thing would — not a symmetrical badge dropped on top of the word.
      */}
      <path
        d="M196 182 C232 176 256 174 272 170"
        fill="none"
        stroke="url(#ul-leaf)"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M272 170 C270 132 308 104 358 102 C360 146 328 174 272 170 Z"
        fill="url(#ul-leaf)"
      />
      <path
        d="M280 167 C306 154 334 130 352 106"
        fill="none"
        stroke="#eaf6e2"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.5"
      />

      {/*
        The rising arrow, crowning the final I: the whole promise of the name. The shaft
        runs up into the middle of the head rather than stopping at its edge — ending it
        short leaves a hairline gap that is invisible at 26px and obvious at 420.
      */}
      <path
        d="M588 122 C594 92 602 62 618 36"
        fill="none"
        stroke="url(#ul-gold)"
        strokeWidth="17"
        strokeLinecap="round"
      />
      <path d="M630 6 L644 52 L598 40 Z" fill="url(#ul-gold)" />

      <rect
        x="8"
        y="180"
        width="644"
        height="46"
        rx="23"
        fill={GREEN_DEEP}
      />
      <text
        x="330"
        y="211"
        textLength="600"
        lengthAdjust="spacingAndGlyphs"
        textAnchor="middle"
        style={{ fontFamily: "var(--font-display)" }}
        fontSize="22"
        fontWeight="600"
        fill="#f5f3ec"
      >
        Unified Network for New-age Agriculture, Technology &amp; Innovation
      </text>

      <path d="M96 242 L564 242" stroke="url(#ul-rule)" strokeWidth="5" />
    </svg>
  );
}

/**
 * Leaf and arrow alone, for the masthead and the browser tab.
 *
 * Everything that would not survive being 22 pixels tall has been taken out. What is
 * left is the pair that carries the idea — something growing, and a figure going up —
 * which is also the pair a farmer will come to recognise before they can read the name.
 */
export function LogoMark({
  size = 26,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <Paint prefix="um" />

      <path
        d="M4 38 C12 36 18 34 22 32"
        fill="none"
        stroke="url(#um-leaf)"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path
        d="M22 32 C20 18 27 9 39 8 C40 22 34 34 22 32 Z"
        fill="url(#um-leaf)"
      />

      {/* Shaft runs into the head, for the same reason it does in the full lockup. */}
      <path
        d="M30 44 C31 37 33 31 40 24"
        fill="none"
        stroke="url(#um-gold)"
        strokeWidth="4.6"
        strokeLinecap="round"
      />
      <path d="M44 13 L46.5 29 L33 24 Z" fill="url(#um-gold)" />
    </svg>
  );
}
