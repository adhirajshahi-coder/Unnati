/**
 * Post-harvest loss estimation.
 *
 * PRD §5.1 requires net price to subtract "estimated spoilage loss (based on crop shelf
 * life and travel time)". This module is that estimate.
 *
 * The model is deliberately simple and explainable, because a farmer has to believe it:
 *
 *   loss fraction = spoilageRatePerDay × elapsed days × gradeFactor × urgencyFactor
 *
 * `elapsed` counts from harvest, not from dispatch — produce sitting in a yard is
 * degrading just as surely as produce on a truck. `urgencyFactor` rises once elapsed
 * time passes the crop's shelf life, where deterioration stops being linear.
 */

export interface SpoilageInput {
  spoilageRatePerDay: number;
  shelfLifeHours: number;
  /** Hours already elapsed since harvest when the truck leaves. */
  hoursSinceHarvest: number;
  /** Estimated hours from dispatch to sale at the mandi. */
  transitHours: number;
  grade?: "A" | "B" | "C";
}

export interface SpoilageEstimate {
  /** Fraction of the consignment's value lost, clamped to [0, 0.6]. */
  lossFraction: number;
  lossPercent: number;
  totalHours: number;
  shelfLifeHours: number;
  /** True when the produce arrives past its safe window — triggers FR alerts. */
  exceedsShelfLife: boolean;
  /** Hours of headroom left, negative when already over. */
  marginHours: number;
}

/** Better-graded produce is firmer and travels better. */
const GRADE_FACTOR: Record<string, number> = { A: 0.85, B: 1, C: 1.25 };

/** Past shelf life, losses accelerate rather than continuing linearly. */
const OVERRUN_PENALTY = 1.8;

/** Nobody should be told they will lose everything; cap the estimate. */
const MAX_LOSS = 0.6;

export function estimateSpoilage(input: SpoilageInput): SpoilageEstimate {
  const {
    spoilageRatePerDay,
    shelfLifeHours,
    hoursSinceHarvest,
    transitHours,
    grade = "B",
  } = input;

  const totalHours = Math.max(0, hoursSinceHarvest + transitHours);

  const withinHours = Math.min(totalHours, shelfLifeHours);
  const overrunHours = Math.max(0, totalHours - shelfLifeHours);

  const base =
    spoilageRatePerDay *
    (withinHours / 24 + (overrunHours / 24) * OVERRUN_PENALTY);

  const lossFraction = clamp(base * (GRADE_FACTOR[grade] ?? 1), 0, MAX_LOSS);

  return {
    lossFraction,
    lossPercent: Math.round(lossFraction * 1000) / 10,
    totalHours: Math.round(totalHours * 10) / 10,
    shelfLifeHours,
    exceedsShelfLife: totalHours > shelfLifeHours,
    marginHours: Math.round((shelfLifeHours - totalHours) * 10) / 10,
  };
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
