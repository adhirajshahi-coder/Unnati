/**
 * Farmer-led pooling: what would a shared truck cost, before one exists?
 *
 * A smallholder with ten quintal cannot fill a vehicle, and quoting them a whole
 * truck is the problem this product exists to solve. But to offer them a share, the
 * app has to answer a question about a truck nobody has booked yet: *if we gather
 * enough neighbours, what would you pay?*
 *
 * That answer has to be honest in both directions. It must be low enough to be worth
 * organising a group for, and it must not promise a price the group will miss if
 * nobody else joins — so every projection here is paired with what the farmer pays at
 * the group's **current** size, not only at its target.
 */
import { tripCost, splitCost, soloCost, savings } from "./costs";

/**
 * The vehicles actually available in a district, smallest first.
 *
 * Rates are per kilometre for the whole vehicle. A bigger truck costs more per trip
 * but less per kilogram once it is full, which is the entire economics of pooling —
 * and why the group is steered to the smallest vehicle that fits rather than the
 * cheapest headline rate.
 */
export interface Vehicle {
  type: string;
  capacityKg: number;
  ratePerKm: number;
}

export const VEHICLES: Vehicle[] = [
  { type: "Ashok Leyland Dost", capacityKg: 1500, ratePerKm: 22 },
  { type: "Tata 407", capacityKg: 4000, ratePerKm: 34 },
  { type: "Eicher 14 ft", capacityKg: 9000, ratePerKm: 46 },
  { type: "Eicher 19 ft", capacityKg: 15000, ratePerKm: 58 },
];

/**
 * Smallest vehicle that carries the load.
 *
 * Rounding up to a bigger truck than the group needs would quietly inflate everyone's
 * share, so the group aims at the smallest one that fits and only steps up when the
 * weight genuinely demands it. A load over the largest vehicle returns that vehicle;
 * splitting across two trucks is a scheduling problem, not a pricing one.
 */
export function pickVehicle(totalKg: number): Vehicle {
  return (
    VEHICLES.find((v) => v.capacityKg >= totalKg) ?? VEHICLES[VEHICLES.length - 1]
  );
}

export interface PoolProjection {
  vehicle: Vehicle;
  /** Whole-vehicle cost for the run, in rupees. */
  tripCost: number;
  /** Total weight currently committed by the group. */
  committedKg: number;
  /** What this farmer pays if the group travels at its current size. */
  shareNow: number;
  /** …and per kilogram, which is how a farmer compares offers. */
  perKgNow: number;
  /** What they would pay if the vehicle filled up. */
  shareIfFull: number;
  perKgIfFull: number;
  /** Cost of hiring the whole vehicle alone — the number to beat. */
  soloCost: number;
  savedNow: number;
  savedPercentNow: number;
  /** Weight still needed to fill the vehicle. */
  remainingKg: number;
  fillRate: number;
  /**
   * True when the group is already worth dispatching. Below this an operator will
   * not take the run, so telling a farmer it is ready would be a false promise.
   */
  viable: boolean;
}

/** Below this fill an operator loses money on the run and will decline it. */
export const VIABLE_FILL = 0.6;

/**
 * Project a farmer's cost in a group.
 *
 * `committedKg` includes this farmer's own load. With a group of one, `shareNow`
 * equals the solo cost — which is correct and worth showing: it is exactly why the
 * farmer should invite their neighbours.
 */
export function projectPool(
  myKg: number,
  committedKg: number,
  distanceKm: number,
  vehicle = pickVehicle(committedKg),
): PoolProjection {
  const cost = tripCost(distanceKm, vehicle.ratePerKm);

  const shareOf = (totalKg: number) => {
    if (totalKg <= 0) return cost;
    const [mine] = splitCost(
      [
        { id: "me", quantityKg: myKg, detourKm: 0 },
        // The rest of the group as a single counterparty: the split is by weight, so
        // how the remainder is divided among them does not change this farmer's share.
        ...(totalKg > myKg
          ? [{ id: "rest", quantityKg: totalKg - myKg, detourKm: 0 }]
          : []),
      ],
      cost,
      vehicle.ratePerKm,
    );
    return mine.total;
  };

  const shareNow = shareOf(committedKg);
  const shareIfFull = shareOf(vehicle.capacityKg);

  // The comparison has to be against the truck this farmer would actually hire on
  // their own — the smallest one their load fits in — not the larger vehicle the
  // group is aiming at. Using the group's rate here would inflate the saving by
  // charging the solo case for capacity the farmer would never have paid for, and a
  // saving this product overstates is worse than one it understates.
  const solo = soloCost(distanceKm, pickVehicle(myKg).ratePerKm);
  const s = savings(solo, shareNow);

  return {
    vehicle,
    tripCost: cost,
    committedKg,
    shareNow,
    perKgNow: myKg > 0 ? Math.round((shareNow / myKg) * 100) / 100 : 0,
    shareIfFull,
    perKgIfFull: myKg > 0 ? Math.round((shareIfFull / myKg) * 100) / 100 : 0,
    soloCost: solo,
    savedNow: s.saved,
    savedPercentNow: s.percent,
    remainingKg: Math.max(0, vehicle.capacityKg - committedKg),
    fillRate: Math.round((committedKg / vehicle.capacityKg) * 100),
    viable: committedKg >= vehicle.capacityKg * VIABLE_FILL,
  };
}

/**
 * The offer shown to a farmer who has no group yet.
 *
 * Aimed at a vehicle sized for a realistic gathering rather than this one load: a
 * farmer sending ten quintal is not going to fill a Dost on their own either, and
 * sizing the projection to their own weight would show them a solo price dressed up
 * as a shared one.
 */
export function projectNewPool(
  myKg: number,
  distanceKm: number,
): PoolProjection & { targetKg: number } {
  // Aim one size above what this farmer alone needs, since the point is to gather
  // neighbours — but never beyond the largest vehicle.
  const own = pickVehicle(myKg);
  const index = VEHICLES.indexOf(own);
  const target = VEHICLES[Math.min(index + 1, VEHICLES.length - 1)];

  // Quote the honest case: the group reaches the minimum an operator will accept.
  const assumedKg = Math.max(myKg, Math.round(target.capacityKg * VIABLE_FILL));

  return {
    ...projectPool(myKg, assumedKg, distanceKm, target),
    targetKg: assumedKg,
  };
}
