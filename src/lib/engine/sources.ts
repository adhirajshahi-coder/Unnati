/**
 * Choosing between two prices for the same crop at the same mandi.
 *
 * Recency alone is not enough. The app ships baseline prices so it is useful before
 * any feed is connected, and those are written with the current timestamp — so a
 * genuine government price whose arrival stamp is 09:00 that morning can look *older*
 * than a synthetic baseline written at noon, and lose. The farmer then sees an
 * invented number while a real one sits unused in the same table.
 *
 * So: within a day of each other, the more trustworthy source wins. Beyond that,
 * recency wins, because a week-old government price is worse than today's estimate.
 */

/** Higher is more trustworthy. */
const TRUST: Record<string, number> = {
  AGMARKNET_LIVE: 3, // pulled from the government feed
  ENAM: 3,
  FIELD_VERIFIED: 2, // submitted by a field agent on the ground
  AGMARKNET: 2, // historical government data
  SEED_BASELINE: 1, // shipped with the app so it works out of the box
};

export function trustOf(source: string): number {
  return TRUST[source] ?? 0;
}

/** Prices this close together are treated as equally current. */
const SAME_DAY_MS = 24 * 60 * 60 * 1000;

export interface PriceCandidate {
  source: string;
  recordedAt: Date;
}

/**
 * True when `a` should be shown instead of `b`.
 *
 * Exported and pure so the rule is testable — it decides which number a farmer acts
 * on, which makes it part of the decision engine rather than a display detail.
 */
export function preferPrice(a: PriceCandidate, b: PriceCandidate): boolean {
  const gap = a.recordedAt.getTime() - b.recordedAt.getTime();

  if (Math.abs(gap) < SAME_DAY_MS) {
    const ta = trustOf(a.source);
    const tb = trustOf(b.source);
    if (ta !== tb) return ta > tb;
  }

  return gap > 0;
}

/** Reduce a list of candidates to the one that should be shown. */
export function bestPrice<T extends PriceCandidate>(rows: T[]): T | undefined {
  let best: T | undefined;
  for (const row of rows) {
    if (!best || preferPrice(row, best)) best = row;
  }
  return best;
}
