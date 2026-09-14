/**
 * Transport cost and cost-splitting.
 *
 * FR-6: "System shall split transport cost proportionally among pooled farmers."
 *
 * Fairness rule used here, and shown to farmers verbatim in the UI:
 *
 *   1. The shared leg — the run the truck would have made anyway — is split by weight.
 *   2. A detour made specifically to collect one farmer is charged to that farmer alone.
 *
 * Splitting purely by weight would make a farmer on the direct route subsidise a farmer
 * 20 km off it, which is exactly the kind of hidden cross-charge PRD §8 says we must not
 * have. Splitting purely by distance would let a farmer send 50 kg for the same price as
 * one sending 3 tonnes. Charging the detour to whoever caused it, and the rest by weight,
 * is defensible to both.
 */

export interface LoadShareInput {
  id: string;
  quantityKg: number;
  /** Extra kilometres this pickup adds to the route. */
  detourKm: number;
}

export interface LoadShare {
  id: string;
  quantityKg: number;
  detourKm: number;
  /** Share of the shared leg, in rupees. */
  baseShare: number;
  /** Cost of the detour made for this farmer, in rupees. */
  detourCharge: number;
  /** baseShare + detourCharge, in rupees. */
  total: number;
  /** Effective ₹ per kg — the number a farmer actually compares. */
  perKg: number;
}

/** Whole-vehicle cost of a run, before any pooling. */
export function tripCost(distanceKm: number, ratePerKm: number): number {
  return Math.round(distanceKm * ratePerKm);
}

/**
 * Split a trip's cost across its loads.
 *
 * `totalCost` covers the base run only. Detour charges are additional, so the sum of
 * the returned totals is `totalCost + Σ(detour cost)` — which is what the operator is
 * actually owed for driving those extra kilometres.
 */
export function splitCost(
  loads: LoadShareInput[],
  totalCost: number,
  ratePerKm: number,
): LoadShare[] {
  const totalKg = loads.reduce((s, l) => s + l.quantityKg, 0);
  if (totalKg <= 0) return [];

  // Split by weight, then hand the rounding remainder to the largest load so the
  // shares always add back up to exactly totalCost — no stray rupee.
  const raw = loads.map((l) => (totalCost * l.quantityKg) / totalKg);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = totalCost - floors.reduce((s, f) => s + f, 0);

  const order = loads
    .map((l, i) => ({ i, kg: l.quantityKg }))
    .sort((a, b) => b.kg - a.kg || a.i - b.i);

  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }

  return loads.map((l, i) => {
    const detourCharge = Math.round(l.detourKm * ratePerKm);
    const total = floors[i] + detourCharge;
    return {
      id: l.id,
      quantityKg: l.quantityKg,
      detourKm: l.detourKm,
      baseShare: floors[i],
      detourCharge,
      total,
      perKg: l.quantityKg > 0 ? round2(total / l.quantityKg) : 0,
    };
  });
}

/**
 * What one farmer would pay hiring the whole truck alone — the comparison that makes
 * the case for pooling. This is the "before" number in the savings figure.
 */
export function soloCost(distanceKm: number, ratePerKm: number): number {
  return tripCost(distanceKm, ratePerKm);
}

export function savings(solo: number, pooled: number) {
  const saved = Math.max(0, solo - pooled);
  return {
    saved,
    percent: solo > 0 ? Math.round((saved / solo) * 100) : 0,
  };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
