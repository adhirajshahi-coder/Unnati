/**
 * The icon set.
 *
 * Drawn as inline SVG rather than loaded from an icon font: this app is used on 2G,
 * and a destination whose icon has not downloaded yet is a destination a farmer who
 * reads slowly cannot identify at all.
 *
 * The register is the same one the rest of the interface lives in — marks on a printed
 * form. Square caps, a single stroke weight, no fill, no rounded friendliness. They
 * read as something stamped or ruled onto paper, not as app furniture.
 *
 * Each one is drawn from this product's own world where there is a choice: the market
 * is a stall with an awning, not a shop; the trip is a goods truck, not an arrow.
 * An abstract glyph would make the word carry the whole burden, which for this
 * audience is exactly backwards.
 */

export type IconName =
  | "home"
  | "sell"
  | "mandi"
  | "truck"
  | "connect"
  | "bell"
  | "ledger"
  | "help"
  | "speak"
  | "stop";

const STROKE = 1.7;

export function Icon({
  name,
  size = 22,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}

const PATHS: Record<IconName, React.ReactNode> = {
  /* A house, but squat and wide like a village dwelling rather than a gabled cottage. */
  home: (
    <>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5.5 12v8h13v-8" />
      <path d="M10 20v-4.5h4V20" />
    </>
  ),

  /*
   * Selling: the rupee sign, kept from the first pass and drawn rather than set.
   * It is the one mark in this set that every user already reads fluently — it is on
   * the notes in their pocket — so replacing it with a cleverer pictogram would be a
   * downgrade dressed as consistency.
   */
  sell: (
    <>
      <path d="M7 5h10" />
      <path d="M7 9h10" />
      <path d="M13.5 5c2.5 0 3.5 2 3.5 4s-1.5 3.5-4.5 3.5H7" />
      <path d="M11 12.5 17 20" />
    </>
  ),

  /* A market stall: awning over a counter, on two posts. */
  mandi: (
    <>
      <path d="M3 9.5 5.5 4.5h13L21 9.5Z" />
      <path d="M3 9.5h18" />
      <path d="M5 9.5V20" />
      <path d="M19 9.5V20" />
      <path d="M5 14.5h14" />
    </>
  ),

  /* A goods truck: box body, cab, two wheels. */
  truck: (
    <>
      <path d="M2.5 6.5h11v9h-11z" />
      <path d="M13.5 10h4l3 3v2.5h-7z" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
      <path d="M9 18h6" />
      <path d="M2.5 18h2.5" />
    </>
  ),

  /* Two people side by side — the whole point of the pooling half of the product. */
  connect: (
    <>
      <circle cx="8.5" cy="8" r="2.75" />
      <circle cx="16.5" cy="9.5" r="2.25" />
      <path d="M3.5 19v-1.5c0-2.2 2.2-3.5 5-3.5s5 1.3 5 3.5V19" />
      <path d="M15 14.2c2.7.1 5.5 1.2 5.5 3.3V19" />
    </>
  ),

  /* A bell, rung to call people to the mandi. */
  bell: (
    <>
      <path d="M6 17V11a6 6 0 0 1 12 0v6" />
      <path d="M4 17h16" />
      <path d="M10 20h4" />
      <path d="M12 5V3" />
    </>
  ),

  /* The ledger: a ruled book, which is how this money has always been kept. */
  ledger: (
    <>
      <path d="M4.5 4h15v16h-15z" />
      <path d="M8.5 4v16" />
      <path d="M11.5 9h5" />
      <path d="M11.5 12.5h5" />
      <path d="M11.5 16h3" />
    </>
  ),

  help: (
    <>
      <path d="M9 9a3 3 0 1 1 3.6 2.94c-.9.2-1.6 1-1.6 2.06v.5" />
      <path d="M11 18h1.8" />
    </>
  ),

  /*
   * Read aloud: a horn speaker with two arcs of sound.
   *
   * The arcs are what carry it. A cone alone reads as a volume control — something you
   * turn down — and this button does the opposite: it makes the page say itself out
   * loud, which for a farmer who does not read is the difference between a screen and
   * a person telling them the price.
   */
  speak: (
    <>
      <path d="M3.5 9.5h3.5L12 5.5v13L7 14.5H3.5Z" />
      <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />
      <path d="M18.3 6.4a8 8 0 0 1 0 11.2" />
    </>
  ),

  /* Stop: the square on a cassette deck, which is the one control everyone knows. */
  stop: <path d="M6 6h12v12H6z" />,
};
