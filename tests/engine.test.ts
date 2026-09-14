/**
 * Unit tests for the decision engine.
 *
 * PDD §8 names three things that must be unit tested: price calculation, cost-split
 * logic, and the matching algorithm. Those are what is covered here.
 *
 * Run with `npm test` (Node's built-in runner; no test framework dependency).
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  haversineKm,
  roadDistanceKm,
  detourKm,
  transitHours,
} from "../src/lib/engine/geo";
import { splitCost, tripCost, savings } from "../src/lib/engine/costs";
import { estimateSpoilage } from "../src/lib/engine/spoilage";
import { rankMandis, type MandiCandidate } from "../src/lib/engine/netPrice";
import {
  scoreLoads,
  bestFill,
  pooledQuote,
  loadingSequence,
  type PendingLoad,
  type TripContext,
} from "../src/lib/engine/pooling";

/* ------------------------------------------------------------------- geo */

describe("geo", () => {
  test("haversine matches a known Nashik → Lasalgaon separation", () => {
    const nashik = { lat: 19.9975, lng: 73.7898 };
    const lasalgaon = { lat: 20.1467, lng: 74.2394 };
    const d = haversineKm(nashik, lasalgaon);
    // Roughly 50 km apart as the crow flies.
    assert.ok(d > 45 && d < 55, `expected ~50 km, got ${d}`);
  });

  test("distance to self is zero", () => {
    const p = { lat: 20.1, lng: 74.2 };
    assert.equal(haversineKm(p, p), 0);
    assert.equal(roadDistanceKm(p, p), 0);
  });

  test("road distance exceeds straight-line distance", () => {
    const a = { lat: 19.9975, lng: 73.7898 };
    const b = { lat: 19.0760, lng: 72.8777 };
    assert.ok(roadDistanceKm(a, b) > haversineKm(a, b));
  });

  test("a pickup exactly on the route adds no detour", () => {
    // Along a meridian, so the midpoint really does lie on the great circle. (A point
    // at constant *latitude* does not — the great circle bows poleward — which would
    // make this assertion fail by a few hundred metres for the wrong reason.)
    const origin = { lat: 19.5, lng: 74.0 };
    const dest = { lat: 20.5, lng: 74.0 };
    const midpoint = { lat: 20.0, lng: 74.0 };
    assert.equal(detourKm(origin, midpoint, dest), 0);
  });

  test("a pickup off the route adds a positive detour", () => {
    const origin = { lat: 20.0, lng: 74.0 };
    const dest = { lat: 20.0, lng: 74.6 };
    const offRoute = { lat: 20.4, lng: 74.3 };
    assert.ok(detourKm(origin, offRoute, dest) > 0);
  });

  test("detour is never negative", () => {
    const origin = { lat: 20.0, lng: 74.0 };
    const dest = { lat: 20.0, lng: 74.6 };
    // A "via" point behind the origin still cannot shorten the trip.
    assert.ok(detourKm(origin, { lat: 20.0, lng: 73.5 }, dest) >= 0);
  });

  test("transit hours include the fixed handling allowance", () => {
    assert.ok(transitHours(0) >= 2.5);
    assert.ok(transitHours(140) > transitHours(70));
  });
});

/* ----------------------------------------------------------- cost split */

describe("cost split (FR-6)", () => {
  const RATE = 40;

  test("shares sum to exactly the trip cost when there is no detour", () => {
    const total = tripCost(100, RATE); // 4000
    const shares = splitCost(
      [
        { id: "a", quantityKg: 1000, detourKm: 0 },
        { id: "b", quantityKg: 2000, detourKm: 0 },
        { id: "c", quantityKg: 500, detourKm: 0 },
      ],
      total,
      RATE,
    );
    assert.equal(
      shares.reduce((s, x) => s + x.total, 0),
      total,
    );
  });

  test("splits proportionally by weight", () => {
    const shares = splitCost(
      [
        { id: "a", quantityKg: 1000, detourKm: 0 },
        { id: "b", quantityKg: 3000, detourKm: 0 },
      ],
      4000,
      RATE,
    );
    const a = shares.find((s) => s.id === "a")!;
    const b = shares.find((s) => s.id === "b")!;
    assert.equal(a.total, 1000);
    assert.equal(b.total, 3000);
    // Equal ₹/kg is the fairness property that makes the split explainable.
    assert.equal(a.perKg, b.perKg);
  });

  test("a rounding remainder never vanishes or duplicates", () => {
    // 1000 split three ways does not divide evenly.
    const shares = splitCost(
      [
        { id: "a", quantityKg: 100, detourKm: 0 },
        { id: "b", quantityKg: 100, detourKm: 0 },
        { id: "c", quantityKg: 100, detourKm: 0 },
      ],
      1000,
      RATE,
    );
    assert.equal(
      shares.reduce((s, x) => s + x.total, 0),
      1000,
    );
  });

  test("a detour is charged to the farmer who caused it, not shared", () => {
    const shares = splitCost(
      [
        { id: "onRoute", quantityKg: 1000, detourKm: 0 },
        { id: "offRoute", quantityKg: 1000, detourKm: 10 },
      ],
      4000,
      RATE,
    );
    const on = shares.find((s) => s.id === "onRoute")!;
    const off = shares.find((s) => s.id === "offRoute")!;

    assert.equal(on.baseShare, off.baseShare, "base leg splits evenly by weight");
    assert.equal(on.detourCharge, 0);
    assert.equal(off.detourCharge, 400); // 10 km × ₹40
    assert.ok(off.total > on.total);
  });

  test("an empty trip splits into nothing rather than dividing by zero", () => {
    assert.deepEqual(splitCost([], 4000, RATE), []);
  });

  test("pooling beats hiring alone", () => {
    const solo = tripCost(120, RATE); // 4800
    const shares = splitCost(
      [
        { id: "me", quantityKg: 1000, detourKm: 0 },
        { id: "neighbour1", quantityKg: 1500, detourKm: 0 },
        { id: "neighbour2", quantityKg: 1500, detourKm: 0 },
      ],
      solo,
      RATE,
    );
    const mine = shares.find((s) => s.id === "me")!;
    const s = savings(solo, mine.total);
    assert.ok(s.saved > 0);
    assert.ok(s.percent >= 70, `expected a large saving, got ${s.percent}%`);
  });
});

/* -------------------------------------------------------------- spoilage */

describe("spoilage", () => {
  const tomato = { spoilageRatePerDay: 0.08, shelfLifeHours: 72 };

  test("no elapsed time means no loss", () => {
    const e = estimateSpoilage({
      ...tomato,
      hoursSinceHarvest: 0,
      transitHours: 0,
    });
    assert.equal(e.lossFraction, 0);
  });

  test("loss grows with time in transit", () => {
    const short = estimateSpoilage({
      ...tomato,
      hoursSinceHarvest: 2,
      transitHours: 4,
    });
    const long = estimateSpoilage({
      ...tomato,
      hoursSinceHarvest: 2,
      transitHours: 20,
    });
    assert.ok(long.lossFraction > short.lossFraction);
  });

  test("passing shelf life is flagged and penalised", () => {
    const e = estimateSpoilage({
      ...tomato,
      hoursSinceHarvest: 60,
      transitHours: 24,
    });
    assert.equal(e.exceedsShelfLife, true);
    assert.ok(e.marginHours < 0);
  });

  test("better grades travel better", () => {
    const base = { ...tomato, hoursSinceHarvest: 12, transitHours: 10 };
    const a = estimateSpoilage({ ...base, grade: "A" });
    const c = estimateSpoilage({ ...base, grade: "C" });
    assert.ok(a.lossFraction < c.lossFraction);
  });

  test("loss is capped rather than reaching a total write-off", () => {
    const e = estimateSpoilage({
      ...tomato,
      hoursSinceHarvest: 500,
      transitHours: 500,
    });
    assert.ok(e.lossFraction <= 0.6);
  });

  test("a hardy crop loses less than a perishable one over the same journey", () => {
    const journey = { hoursSinceHarvest: 10, transitHours: 12 };
    const wheat = estimateSpoilage({
      spoilageRatePerDay: 0.002,
      shelfLifeHours: 2160,
      ...journey,
    });
    const tom = estimateSpoilage({ ...tomato, ...journey });
    assert.ok(wheat.lossFraction < tom.lossFraction);
  });
});

/* ------------------------------------------------------- net price (FR-2) */

function mandi(over: Partial<MandiCandidate> & { id: string }): MandiCandidate {
  return {
    name: over.id,
    nameHi: over.id,
    district: "Nashik",
    state: "Maharashtra",
    lat: 20.0,
    lng: 74.0,
    commissionRate: 0.02,
    marketFeePerQuintal: 10,
    modalPrice: 2000,
    minPrice: 1800,
    maxPrice: 2200,
    source: "AGMARKNET",
    recordedAt: new Date("2026-09-14T06:00:00Z"),
    ...over,
  } as MandiCandidate;
}

describe("net price ranking (FR-1, FR-2)", () => {
  const now = new Date("2026-09-14T09:00:00Z");
  const origin = { lat: 20.0, lng: 74.0 };
  const onion = { spoilageRatePerDay: 0.015, shelfLifeHours: 720 };

  const baseInput = {
    origin,
    // A smallholder's load. Size matters to the result: transport is charged per trip,
    // not per kg, so the smaller the consignment the more a long haul has to earn.
    quantityKg: 1000,
    grade: "B" as const,
    hoursSinceHarvest: 6,
    crop: onion,
    radiusKm: 200,
    soloRatePerKm: 40,
  };

  test("the highest gross price does not automatically win", () => {
    const ranked = rankMandis(
      {
        ...baseInput,
        candidates: [
          // Right next door, a middling price.
          mandi({ id: "local", lat: 20.0, lng: 74.02, modalPrice: 2000 }),
          // Much better price, but 1.5 degrees away — roughly 200 km of driving.
          mandi({ id: "distant", lat: 20.0, lng: 75.2, modalPrice: 2300 }),
        ],
      },
      now,
    );

    assert.equal(ranked.length, 2);
    assert.equal(
      ranked[0].mandi.id,
      "local",
      "transport should wipe out a 15% gross premium at that distance",
    );
    assert.ok(ranked[1].transportCost > ranked[0].transportCost);
  });

  test("a large enough price gap does justify the longer haul", () => {
    const ranked = rankMandis(
      {
        ...baseInput,
        candidates: [
          mandi({ id: "local", lat: 20.0, lng: 74.02, modalPrice: 2000 }),
          mandi({ id: "distant", lat: 20.0, lng: 74.6, modalPrice: 3200 }),
        ],
      },
      now,
    );
    assert.equal(ranked[0].mandi.id, "distant");
    assert.ok(ranked[0].advantageOverNearest > 0);
  });

  test("pooling can flip the decision toward the better-paying mandi", () => {
    const candidates = [
      mandi({ id: "local", lat: 20.0, lng: 74.02, modalPrice: 2000 }),
      mandi({ id: "distant", lat: 20.0, lng: 75.2, modalPrice: 2300 }),
    ];

    const solo = rankMandis({ ...baseInput, candidates }, now);
    assert.equal(solo[0].mandi.id, "local");

    const pooled = rankMandis(
      {
        ...baseInput,
        candidates,
        pooledOffers: {
          distant: {
            costForThisLoad: 1200,
            tripId: "trip-1",
            departAt: now,
            seatsKg: 5000,
          },
        },
      },
      now,
    );
    assert.equal(pooled[0].mandi.id, "distant");
    assert.equal(pooled[0].pooled, true);
    assert.equal(pooled[0].pooledTripId, "trip-1");
  });

  test("mandis beyond the radius are excluded", () => {
    const ranked = rankMandis(
      {
        ...baseInput,
        radiusKm: 30,
        candidates: [
          mandi({ id: "near", lat: 20.0, lng: 74.05 }),
          mandi({ id: "far", lat: 21.5, lng: 74.0 }),
        ],
      },
      now,
    );
    assert.deepEqual(
      ranked.map((r) => r.mandi.id),
      ["near"],
    );
  });

  test("every deduction is itemised and the arithmetic closes", () => {
    const [r] = rankMandis(
      {
        ...baseInput,
        candidates: [mandi({ id: "one", lat: 20.0, lng: 74.2 })],
      },
      now,
    );
    assert.equal(
      r.netValue,
      r.grossValue -
        r.commission -
        r.marketFee -
        r.transportCost -
        r.spoilageLoss,
    );
  });

  test("stale prices are marked low confidence", () => {
    const [r] = rankMandis(
      {
        ...baseInput,
        candidates: [
          mandi({
            id: "stale",
            recordedAt: new Date("2026-09-10T06:00:00Z"),
          }),
        ],
      },
      now,
    );
    assert.equal(r.confidence, "LOW");
  });

  test("an empty candidate set ranks to nothing rather than throwing", () => {
    assert.deepEqual(rankMandis({ ...baseInput, candidates: [] }, now), []);
  });
});

/* --------------------------------------------------- best fill (FR-4, -5) */

function pending(
  id: string,
  quantityKg: number,
  lat: number,
  lng: number,
): PendingLoad {
  return {
    id,
    farmerId: `f-${id}`,
    farmerName: id,
    cropId: "onion",
    cropName: "Onion",
    quantityKg,
    pickupName: id,
    pickupLat: lat,
    pickupLng: lng,
    dispatchBy: new Date("2026-09-16T00:00:00Z"),
  };
}

describe("best fill (FR-4, FR-5)", () => {
  const trip: TripContext = {
    origin: { lat: 20.0, lng: 74.0 },
    destination: { lat: 20.0, lng: 74.8 },
    capacityKg: 5000,
    usedKg: 0,
    totalCost: 4800,
    ratePerKm: 40,
    departAt: new Date("2026-09-14T18:00:00Z"),
  };

  test("a pooled quote covers the operator's cost for the space used", () => {
    // Half the truck must be worth at least half the run, or pooling loses money.
    const half = pooledQuote(2500, 5000, 4800, 0, 40);
    assert.ok(half >= 2400, `quote ${half} is below cost recovery`);
  });

  test("never exceeds capacity", () => {
    const loads = [
      pending("a", 3000, 20.0, 74.2),
      pending("b", 3000, 20.0, 74.4),
      pending("c", 3000, 20.0, 74.6),
    ];
    const fill = bestFill(scoreLoads(loads, trip), trip);
    assert.ok(fill.totalKg <= trip.capacityKg);
  });

  test("respects capacity already committed", () => {
    const partial = { ...trip, usedKg: 4000 };
    const loads = [pending("a", 2000, 20.0, 74.2)];
    const fill = bestFill(scoreLoads(loads, partial), partial);
    assert.equal(fill.selected.length, 0, "2t will not fit in 1t of space");
    assert.equal(fill.totalKg, 4000);
  });

  test("prefers the on-route load over an equal one far off it", () => {
    const loads = [
      pending("onRoute", 4000, 20.0, 74.4),
      pending("offRoute", 4000, 21.2, 74.4),
    ];
    const fill = bestFill(scoreLoads(loads, trip), trip);
    assert.equal(fill.selected.length, 1);
    assert.equal(fill.selected[0].id, "onRoute");
  });

  test("a load that cannot make the departure deadline is rejected", () => {
    const late = {
      ...pending("late", 1000, 20.0, 74.4),
      dispatchBy: new Date("2026-09-14T06:00:00Z"), // before departAt
    };
    const fill = bestFill(scoreLoads([late], trip), trip);
    assert.equal(fill.selected.length, 0);
    assert.equal(fill.rejected[0].meetsDeadline, false);
  });

  test("fill rate is reported and improves with pooling", () => {
    const loads = [
      pending("a", 1500, 20.0, 74.2),
      pending("b", 1500, 20.0, 74.3),
      pending("c", 1500, 20.0, 74.5),
    ];
    const fill = bestFill(scoreLoads(loads, trip), trip);
    assert.ok(fill.fillRate >= 80, `fill rate was ${fill.fillRate}%`);
    assert.equal(fill.method, "exact");
  });

  test("the exact solver beats a naive largest-first choice", () => {
    // Largest-first takes the 3000 and stops (3000 of 4000 used). The optimum is
    // 2000 + 2000, which fills the truck completely.
    const tight: TripContext = { ...trip, capacityKg: 4000 };
    const loads = [
      pending("big", 3000, 20.0, 74.4),
      pending("mid1", 2000, 20.0, 74.4),
      pending("mid2", 2000, 20.0, 74.4),
    ];
    const fill = bestFill(scoreLoads(loads, tight), tight);
    assert.equal(fill.totalKg, 4000);
    assert.equal(fill.selected.length, 2);
  });

  test("no candidates yields an empty, non-throwing result", () => {
    const fill = bestFill([], trip);
    assert.deepEqual(fill.selected, []);
    assert.equal(fill.fillRate, 0);
  });

  test("loading sequence puts the first pickup first", () => {
    const seq = loadingSequence(
      [
        { id: "far", pickupLat: 20.0, pickupLng: 74.7, cropName: "Onion" },
        { id: "near", pickupLat: 20.0, pickupLng: 74.1, cropName: "Onion" },
      ],
      trip,
    );
    assert.equal(seq[0].order, 1);
    assert.equal(seq.length, 2);
  });
});
