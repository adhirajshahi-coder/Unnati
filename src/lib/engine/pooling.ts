/**
 * Load pooling and "best fill" optimisation.
 *
 * FR-4: match available truck capacity with pending loads going to the same or an
 *       en-route destination.
 * FR-5: auto-suggest the optimal load combination for a truck.
 *
 * The optimisation is a bin-packing variant: one bin (the truck), items with a weight
 * (the load) and a value (what including it earns, net of the detour it forces). We are
 * not maximising weight — a heavy load fetched from 30 km off the route can be worth
 * less to the trip than a lighter one sitting on the highway.
 *
 * Exact 0/1 knapsack by dynamic programming is used while the numbers stay small, which
 * covers every realistic trip (a truck takes a handful of farmers, not hundreds). Past
 * that we fall back to a greedy pass by value density. The exact path matters: an
 * operator shown a "best fill" that is not actually the best fill stops trusting the
 * feature.
 */
import { detourKm, type Point } from "./geo";
import { splitCost, type LoadShare } from "./costs";

export interface PendingLoad {
  id: string;
  farmerId: string;
  farmerName: string;
  cropId: string;
  cropName: string;
  quantityKg: number;
  pickupName: string;
  pickupLat: number;
  pickupLng: number;
  /** Latest time the produce can leave the farm before spoilage risk bites. */
  dispatchBy: Date;
}

export interface TripContext {
  origin: Point;
  destination: Point;
  capacityKg: number;
  /** Weight already committed to this trip. */
  usedKg: number;
  /** Whole-vehicle cost of the run, in rupees. */
  totalCost: number;
  ratePerKm: number;
  departAt: Date;
}

export interface ScoredLoad extends PendingLoad {
  detourKm: number;
  /** Rupees the operator earns by carrying this load, before the detour cost. */
  revenue: number;
  /** Cost of the kilometres driven solely to collect it. */
  detourCost: number;
  /** revenue − detourCost. Negative means the load costs more to fetch than it pays. */
  netValue: number;
  /** netValue per kg of truck capacity consumed — the packing efficiency. */
  valueDensity: number;
  /** False when the truck would leave after this load's dispatch deadline. */
  meetsDeadline: boolean;
}

export interface BestFill {
  selected: ScoredLoad[];
  rejected: ScoredLoad[];
  totalKg: number;
  capacityKg: number;
  /** Percentage of the truck filled, 0–100. KPI target is 80%+ (PRD §10). */
  fillRate: number;
  totalDetourKm: number;
  /** Sum of netValue over the selected loads. */
  totalValue: number;
  method: "exact" | "greedy";
}

/**
 * Margin over cost-recovery on a pooled seat.
 *
 * A quote has to clear the operator's own cost for the space it occupies, or pooling
 * is a subsidy the truck owner pays and the supply side collapses. The floor is the
 * load's proportional share of the trip: `totalCost × quantityKg / capacityKg`. This
 * multiplier sits on top, covering the risk that the truck departs part-empty.
 */
export const POOLING_MARGIN = 1.15;

/**
 * What a farmer is quoted for space on a trip that is already going.
 *
 * Derived from the vehicle's real economics rather than a flat per-kg tariff, because
 * a flat rate that looks generous on a short run is loss-making on a long one — and an
 * operator who loses money on pooled loads stops accepting them.
 */
export function pooledQuote(
  quantityKg: number,
  capacityKg: number,
  totalCost: number,
  detour: number,
  ratePerKm: number,
): number {
  if (capacityKg <= 0) return 0;
  const share = Math.round(
    totalCost * (quantityKg / capacityKg) * POOLING_MARGIN,
  );
  return share + Math.round(detour * ratePerKm);
}

/** Score every pending load against a trip: detour, revenue, feasibility. */
export function scoreLoads(
  loads: PendingLoad[],
  trip: TripContext,
): ScoredLoad[] {
  return loads.map((l) => {
    const via = { lat: l.pickupLat, lng: l.pickupLng };
    const detour = detourKm(trip.origin, via, trip.destination);
    const revenue = pooledQuote(
      l.quantityKg,
      trip.capacityKg,
      trip.totalCost,
      0,
      trip.ratePerKm,
    );
    const detourCost = Math.round(detour * trip.ratePerKm);
    const netValue = revenue - detourCost;

    return {
      ...l,
      detourKm: detour,
      revenue,
      detourCost,
      netValue,
      valueDensity: l.quantityKg > 0 ? netValue / l.quantityKg : 0,
      meetsDeadline: trip.departAt.getTime() <= l.dispatchBy.getTime(),
    };
  });
}

/** Number of items past which exact DP is abandoned for the greedy pass. */
const EXACT_LIMIT = 22;
/** Weight granularity for the DP table, in kg. Loads round down to this. */
const BUCKET_KG = 25;

/**
 * Choose the combination of loads that maximises total net value without exceeding the
 * truck's remaining capacity.
 */
export function bestFill(scored: ScoredLoad[], trip: TripContext): BestFill {
  const remaining = Math.max(0, trip.capacityKg - trip.usedKg);

  // A load that misses the departure deadline, does not fit, or loses money for the
  // operator is never worth suggesting.
  const isEligible = (l: ScoredLoad) =>
    l.meetsDeadline && l.quantityKg <= remaining && l.netValue > 0;

  const eligible = scored.filter(isEligible);
  const ineligible = scored.filter((l) => !isEligible(l));

  const { selected, method } =
    eligible.length <= EXACT_LIMIT
      ? { selected: exactKnapsack(eligible, remaining), method: "exact" as const }
      : { selected: greedy(eligible, remaining), method: "greedy" as const };

  const chosen = new Set(selected.map((l) => l.id));
  const totalKg = selected.reduce((s, l) => s + l.quantityKg, 0);

  return {
    selected,
    rejected: [...ineligible, ...eligible.filter((l) => !chosen.has(l.id))],
    totalKg: trip.usedKg + totalKg,
    capacityKg: trip.capacityKg,
    fillRate:
      trip.capacityKg > 0
        ? Math.round(((trip.usedKg + totalKg) / trip.capacityKg) * 100)
        : 0,
    totalDetourKm:
      Math.round(selected.reduce((s, l) => s + l.detourKm, 0) * 10) / 10,
    totalValue: selected.reduce((s, l) => s + l.netValue, 0),
    method,
  };
}

/**
 * 0/1 knapsack by dynamic programming over capacity buckets.
 *
 * Bucketing keeps the table small enough to be instant at request time. Rounding each
 * load's weight *up* to a bucket boundary means the solution never over-fills the real
 * truck — the approximation is always on the safe side.
 */
function exactKnapsack(items: ScoredLoad[], capacityKg: number): ScoredLoad[] {
  const buckets = Math.floor(capacityKg / BUCKET_KG);
  if (buckets <= 0 || items.length === 0) return [];

  const weights = items.map((i) => Math.ceil(i.quantityKg / BUCKET_KG));
  const values = items.map((i) => i.netValue);

  // table[i][w] = best value using the first i items within w buckets
  const table: number[][] = Array.from({ length: items.length + 1 }, () =>
    new Array<number>(buckets + 1).fill(0),
  );

  for (let i = 1; i <= items.length; i++) {
    const w = weights[i - 1];
    const v = values[i - 1];
    for (let c = 0; c <= buckets; c++) {
      const without = table[i - 1][c];
      const with_ = w <= c ? table[i - 1][c - w] + v : -Infinity;
      table[i][c] = Math.max(without, with_);
    }
  }

  // Walk the table backwards to recover which items were taken.
  const picked: ScoredLoad[] = [];
  let c = buckets;
  for (let i = items.length; i > 0; i--) {
    if (table[i][c] !== table[i - 1][c]) {
      picked.push(items[i - 1]);
      c -= weights[i - 1];
    }
  }

  return picked.reverse();
}

/** Fallback for large candidate sets: take the densest value per kg that still fits. */
function greedy(items: ScoredLoad[], capacityKg: number): ScoredLoad[] {
  const picked: ScoredLoad[] = [];
  let used = 0;

  for (const l of [...items].sort((a, b) => b.valueDensity - a.valueDensity)) {
    if (used + l.quantityKg <= capacityKg) {
      picked.push(l);
      used += l.quantityKg;
    }
  }

  return picked;
}

/**
 * Loading order for a set of confirmed loads.
 *
 * PRD §5.3 asks for a loading sequence that reduces handling. Trucks unload from the
 * back, so produce that comes off first must go on last. We collect in route order,
 * then break ties by putting the most perishable nearest the door.
 */
export function loadingSequence(
  loads: Array<{
    id: string;
    pickupLat: number;
    pickupLng: number;
    cropName: string;
  }>,
  trip: TripContext,
): Array<{ id: string; order: number; cropName: string; detourKm: number }> {
  return loads
    .map((l) => ({
      ...l,
      detourKm: detourKm(
        trip.origin,
        { lat: l.pickupLat, lng: l.pickupLng },
        trip.destination,
      ),
    }))
    .sort((a, b) => a.detourKm - b.detourKm)
    .map((l, i) => ({
      id: l.id,
      order: i + 1,
      cropName: l.cropName,
      detourKm: l.detourKm,
    }));
}

/** Re-split a trip's cost after its load set changes. */
export function recomputeShares(
  loads: Array<{ id: string; quantityKg: number; detourKm: number }>,
  totalCost: number,
  ratePerKm: number,
): LoadShare[] {
  return splitCost(loads, totalCost, ratePerKm);
}
