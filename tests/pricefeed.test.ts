/**
 * Tests for the live price feed.
 *
 * The sanity bounds are the point of this file. The government feed carries genuine
 * outliers — a live response really does quote coriander leaves at ₹32,528/quintal —
 * and a farmer who drives 200 km on a number like that has been actively harmed by
 * the app. Rejecting a row is always better than showing a wrong one.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  toRow,
  parseArrivalDate,
  type FeedRecord,
  type CropKey,
} from "../src/lib/pricefeed";
import {
  preferPrice,
  bestPrice,
  trustOf,
} from "../src/lib/engine/sources";

const onion: CropKey = {
  id: "onion",
  agmarknetName: "Onion",
  sanePriceMin: 400,
  sanePriceMax: 6000,
};

const coriander: CropKey = {
  id: "coriander",
  agmarknetName: "Coriander(Leaves)",
  sanePriceMin: 300,
  sanePriceMax: 12000,
};

function record(over: Partial<FeedRecord> = {}): FeedRecord {
  return {
    state: "Haryana",
    district: "Sonipat",
    market: "Sonipat APMC",
    commodity: "Onion",
    variety: "Onion",
    grade: "FAQ",
    arrival_date: "14/09/2026",
    min_price: 1800,
    max_price: 2400,
    modal_price: 2100,
    ...over,
  };
}

describe("arrival date parsing", () => {
  test("reads the feed's dd/mm/yyyy", () => {
    const d = parseArrivalDate("14/09/2026");
    assert.ok(d);
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 8); // September, zero-indexed
    assert.equal(d.getDate(), 14);
  });

  test("day and month are not transposed", () => {
    // 03/09 is 3 September, not 9 March. Getting this backwards would silently
    // mis-date half the feed and make fresh prices look stale.
    const d = parseArrivalDate("03/09/2026")!;
    assert.equal(d.getDate(), 3);
    assert.equal(d.getMonth(), 8);
  });

  test("rejects anything unparseable rather than guessing", () => {
    assert.equal(parseArrivalDate("2026-09-14"), null);
    assert.equal(parseArrivalDate(""), null);
    assert.equal(parseArrivalDate("not a date"), null);
  });
});

describe("sanity bounds", () => {
  test("a plausible price is accepted", () => {
    const r = toRow(record(), "sonipat", onion);
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.row.modalPrice, 2100);
    assert.equal(r.ok && r.row.cropId, "onion");
    assert.equal(r.ok && r.row.mandiId, "sonipat");
  });

  test("rejects the real coriander outlier the feed publishes", () => {
    const r = toRow(
      record({ commodity: "Coriander(Leaves)", modal_price: 32528.05 }),
      "noida",
      coriander,
    );
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.reason, "range");
  });

  test("rejects a price below the floor", () => {
    const r = toRow(record({ modal_price: 12 }), "sonipat", onion);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.reason, "range");
  });

  test("rejects a decimal-point slip", () => {
    // 21000 instead of 2100 — an order of magnitude out, and exactly the kind of
    // error that would send a farmer on a pointless journey.
    const r = toRow(record({ modal_price: 21000 }), "sonipat", onion);
    assert.equal(r.ok, false);
  });

  test("accepts prices exactly on the boundary", () => {
    assert.equal(toRow(record({ modal_price: 400 }), "m", onion).ok, true);
    assert.equal(toRow(record({ modal_price: 6000 }), "m", onion).ok, true);
  });

  test("rejects zero, negative and non-numeric prices", () => {
    for (const bad of [0, -100, "n/a", ""]) {
      const r = toRow(record({ modal_price: bad }), "m", onion);
      assert.equal(r.ok, false, `expected ${bad} to be rejected`);
    }
  });
});

describe("row conversion", () => {
  test("numeric strings from the feed are coerced", () => {
    const r = toRow(
      record({ modal_price: "2100", min_price: "1800", max_price: "2400" }),
      "m",
      onion,
    );
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.row.minPrice, 1800);
    assert.equal(r.ok && r.row.maxPrice, 2400);
  });

  test("a missing min/max falls back to the modal price, never zero", () => {
    // Storing a zero here would later read as "this mandi pays nothing for your
    // crop", which is far worse than showing a narrow range.
    const r = toRow(record({ min_price: 0, max_price: 0 }), "m", onion);
    assert.equal(r.ok, true);
    assert.equal(r.ok && r.row.minPrice, 2100);
    assert.equal(r.ok && r.row.maxPrice, 2100);
  });

  test("a min above the max is straightened out rather than stored inverted", () => {
    const r = toRow(record({ min_price: 2400, max_price: 1800 }), "m", onion);
    assert.equal(r.ok, true);
    assert.ok(r.ok && r.row.minPrice <= r.row.maxPrice);
  });

  test("prices are rounded to whole rupees", () => {
    const r = toRow(record({ modal_price: 2100.47 }), "m", onion);
    assert.equal(r.ok && r.row.modalPrice, 2100);
    assert.ok(r.ok && Number.isInteger(r.row.modalPrice));
  });

  test("the row is tagged as coming from the live feed", () => {
    const r = toRow(record(), "m", onion);
    assert.equal(r.ok && r.row.source, "AGMARKNET_LIVE");
  });

  test("an unreadable arrival date falls back to now rather than dropping the row", () => {
    const r = toRow(record({ arrival_date: "garbage" }), "m", onion);
    assert.equal(r.ok, true);
    assert.ok(r.ok && r.row.recordedAt instanceof Date);
  });
});

/* ------------------------------------------------- choosing between sources */

describe("price source preference", () => {
  const at = (iso: string) => new Date(iso);

  test("a live government price beats a baseline written later the same day", () => {
    // The exact bug this rule exists for: the shipped baseline is stamped with the
    // moment it was written, so it can look newer than a real price whose arrival
    // stamp is that morning — and the farmer would be shown an invented number.
    const live = { source: "AGMARKNET_LIVE", recordedAt: at("2026-09-14T03:30:00Z") };
    const baseline = { source: "SEED_BASELINE", recordedAt: at("2026-09-14T09:00:00Z") };

    assert.equal(preferPrice(live, baseline), true);
    assert.equal(preferPrice(baseline, live), false);
    assert.equal(bestPrice([baseline, live])?.source, "AGMARKNET_LIVE");
  });

  test("a field agent beats the shipped baseline", () => {
    const field = { source: "FIELD_VERIFIED", recordedAt: at("2026-09-14T06:00:00Z") };
    const baseline = { source: "SEED_BASELINE", recordedAt: at("2026-09-14T08:00:00Z") };
    assert.equal(preferPrice(field, baseline), true);
  });

  test("but a stale live price loses to a fresh one", () => {
    // Trust does not outrank a week of staleness: a farmer needs today's number.
    const old = { source: "AGMARKNET_LIVE", recordedAt: at("2026-09-07T09:00:00Z") };
    const fresh = { source: "SEED_BASELINE", recordedAt: at("2026-09-14T09:00:00Z") };
    assert.equal(preferPrice(fresh, old), true);
  });

  test("between two of the same source, the newer wins", () => {
    const older = { source: "AGMARKNET_LIVE", recordedAt: at("2026-09-13T09:00:00Z") };
    const newer = { source: "AGMARKNET_LIVE", recordedAt: at("2026-09-14T09:00:00Z") };
    assert.equal(preferPrice(newer, older), true);
    assert.equal(bestPrice([older, newer]), newer);
  });

  test("an unknown source is trusted least", () => {
    assert.ok(trustOf("AGMARKNET_LIVE") > trustOf("SEED_BASELINE"));
    assert.ok(trustOf("SEED_BASELINE") > trustOf("something-else"));
  });

  test("bestPrice on an empty list returns nothing rather than throwing", () => {
    assert.equal(bestPrice([]), undefined);
  });
});
