/**
 * Tests for farmer-led pooling.
 *
 * The property that matters: a smallholder must end up paying materially less than a
 * whole truck, and the figure they are shown must never promise a price the group has
 * not actually reached.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  pickVehicle,
  projectPool,
  projectNewPool,
  VEHICLES,
  VIABLE_FILL,
} from "../src/lib/engine/grouping";

describe("vehicle selection", () => {
  test("picks the smallest truck that fits", () => {
    assert.equal(pickVehicle(800).capacityKg, 1500);
    assert.equal(pickVehicle(1500).capacityKg, 1500);
    assert.equal(pickVehicle(1501).capacityKg, 4000);
    assert.equal(pickVehicle(9000).capacityKg, 9000);
  });

  test("a load beyond the largest vehicle still returns one", () => {
    const v = pickVehicle(50_000);
    assert.equal(v.capacityKg, VEHICLES[VEHICLES.length - 1].capacityKg);
  });

  test("bigger trucks cost more per trip but less per kg when full", () => {
    const small = VEHICLES[0];
    const large = VEHICLES[2];
    assert.ok(large.ratePerKm > small.ratePerKm);
    assert.ok(
      large.ratePerKm / large.capacityKg < small.ratePerKm / small.capacityKg,
      "pooling only pays if a full big truck is cheaper per kg",
    );
  });
});

describe("projecting a farmer's share", () => {
  const DIST = 100;

  test("a group of one costs the same as going alone", () => {
    // Not a flaw — it is the argument for inviting neighbours, and pretending
    // otherwise would quote a price the farmer will not get.
    const p = projectPool(1000, 1000, DIST);
    assert.equal(p.shareNow, p.soloCost);
    assert.equal(p.savedNow, 0);
  });

  test("the share falls as neighbours join", () => {
    const alone = projectPool(1000, 1000, DIST, VEHICLES[1]);
    const half = projectPool(1000, 2000, DIST, VEHICLES[1]);
    const full = projectPool(1000, 4000, DIST, VEHICLES[1]);

    assert.ok(half.shareNow < alone.shareNow);
    assert.ok(full.shareNow < half.shareNow);
  });

  test("a small farmer saves a large share of the cost once the truck fills", () => {
    // Around 60% against hiring the small truck they would otherwise take alone.
    // It was 75% while the baseline wrongly used the group's larger vehicle; the
    // lower figure is the true one and still comfortably beats the PRD section 10
    // target of a 20-30% reduction in per-farmer transport cost.
    const p = projectPool(1000, 4000, DIST, VEHICLES[1]);
    assert.ok(
      p.savedPercentNow >= 55,
      `expected a large saving, got ${p.savedPercentNow}%`,
    );
  });

  test("the share is proportional to weight, so nobody subsidises anyone", () => {
    const smallFarmer = projectPool(500, 4000, DIST, VEHICLES[1]);
    const bigFarmer = projectPool(2000, 4000, DIST, VEHICLES[1]);
    assert.equal(smallFarmer.perKgNow, bigFarmer.perKgNow);
    assert.ok(bigFarmer.shareNow > smallFarmer.shareNow);
  });

  test("shareIfFull is never worse than the share right now", () => {
    const p = projectPool(1000, 2000, DIST, VEHICLES[1]);
    assert.ok(p.shareIfFull <= p.shareNow);
  });

  test("viability tracks the fill an operator will actually accept", () => {
    const thin = projectPool(500, 500, DIST, VEHICLES[1]);
    const ready = projectPool(1000, 4000 * VIABLE_FILL, DIST, VEHICLES[1]);
    assert.equal(thin.viable, false);
    assert.equal(ready.viable, true);
  });

  test("remaining capacity and fill rate agree with each other", () => {
    const p = projectPool(1000, 3000, DIST, VEHICLES[1]);
    assert.equal(p.remainingKg, 1000);
    assert.equal(p.fillRate, 75);
  });

  test("an empty group does not divide by zero", () => {
    const p = projectPool(0, 0, DIST);
    assert.ok(Number.isFinite(p.shareNow));
    assert.equal(p.perKgNow, 0);
  });
});

describe("the offer made before any group exists", () => {
  test("quotes a real saving to a smallholder", () => {
    const p = projectNewPool(1000, 100);
    assert.ok(p.savedNow > 0);
    assert.ok(
      p.shareNow < p.soloCost,
      "a shared option that costs the same as a full truck is not an option",
    );
  });

  test("aims above the farmer's own load, since the point is to gather others", () => {
    const p = projectNewPool(1000, 100);
    assert.ok(p.targetKg > 1000);
    assert.ok(p.vehicle.capacityKg > pickVehicle(1000).capacityKg);
  });

  test("quotes the minimum viable group, not a full truck", () => {
    // Promising the full-truck price to a farmer whose group may only half fill
    // would be the most damaging number on the screen.
    const p = projectNewPool(1000, 100);
    assert.ok(p.shareNow >= p.shareIfFull);
    assert.equal(p.viable, true);
  });

  test("a farmer with a full load of their own is not promised a discount", () => {
    const p = projectNewPool(14_000, 100);
    assert.ok(p.shareNow <= p.soloCost);
  });
});

describe("the comparison against going alone", () => {
  test("uses the truck the farmer would really hire, not the group's larger one", () => {
    // A 500 kg farmer going alone hires a Dost, not the Tata the group is filling.
    // Charging the solo case for the bigger vehicle would inflate the saving.
    const p = projectPool(500, 2400, 70.5, VEHICLES[1]);
    const ownVehicle = pickVehicle(500);
    assert.equal(p.soloCost, Math.round(70.5 * ownVehicle.ratePerKm));
    assert.ok(
      p.soloCost < Math.round(70.5 * VEHICLES[1].ratePerKm),
      "the solo baseline must not borrow the group's truck rate",
    );
  });

  test("the quoted saving stays true to that baseline", () => {
    const p = projectPool(500, 2400, 70.5, VEHICLES[1]);
    assert.equal(p.savedNow, p.soloCost - p.shareNow);
  });
});

describe("a detour must never make joining worse than going alone", () => {
  /**
   * Found in testing: a farmer joined a group 112 km off its route and was billed
   * three times what hiring his own truck would have cost. Browsing groups applied a
   * detour cap; joining one by id did not. The cap is the guard, so this pins down
   * the arithmetic that makes it necessary.
   */
  test("a far detour can exceed the whole solo cost", () => {
    const p = projectPool(1200, 2600, 70.5, VEHICLES[1]);
    const detourCharge = Math.round(112.3 * VEHICLES[1].ratePerKm);

    assert.ok(
      p.shareNow + detourCharge > p.soloCost,
      "this is the case the join cap exists to refuse",
    );
  });

  test("a detour inside the cap stays cheaper than going alone", () => {
    const p = projectPool(900, 2600, 70.5, VEHICLES[1]);
    const detourCharge = Math.round(17.5 * VEHICLES[1].ratePerKm);

    assert.ok(
      p.shareNow + detourCharge < p.soloCost,
      "a nearby farmer must still come out ahead once their detour is charged",
    );
  });
});
