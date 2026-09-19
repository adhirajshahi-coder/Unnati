import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normaliseDob,
  validPin,
  validEmail,
  MAX_ATTEMPTS,
  LOCKOUT_MS,
  TOKEN_TTL_MS,
} from "../src/lib/pinreset";

/**
 * The date-of-birth reset is the weakest door in this app, so the parts of it that can
 * be tested without a database are tested hard.
 *
 * The date parsing matters more than it looks. A farmer typing their birth date will
 * write it the way every Indian form asks for it, and if the app only understands its
 * own storage format it will reject a correct answer — locking someone out of their own
 * account for getting the separator wrong, which is the exact failure this feature
 * exists to end.
 */

test("accepts the order Indian forms ask for", () => {
  assert.equal(normaliseDob("05/08/1974"), "1974-08-05");
  assert.equal(normaliseDob("5/8/1974"), "1974-08-05");
  assert.equal(normaliseDob("05-08-1974"), "1974-08-05");
});

test("accepts the ISO form the field stores", () => {
  assert.equal(normaliseDob("1974-08-05"), "1974-08-05");
  assert.equal(normaliseDob("1974-8-5"), "1974-08-05");
});

test("pads single digits so the same date always has one spelling", () => {
  // Two spellings of one date would mean a farmer's correct answer failing to match.
  assert.equal(normaliseDob("1/1/1980"), normaliseDob("01-01-1980"));
  assert.equal(normaliseDob("1/1/1980"), "1980-01-01");
});

test("surrounding whitespace does not defeat a correct answer", () => {
  assert.equal(normaliseDob("  05/08/1974  "), "1974-08-05");
});

test("rejects what is not a date rather than guessing", () => {
  for (const bad of ["", "   ", "abc", "05/08", "1974", "05/08/74", "2024-13"]) {
    assert.equal(normaliseDob(bad), null, bad);
  }
});

test("an unparseable date can never match a stored one", () => {
  // resetByDob compares the normalised value, and null must not equal an empty field.
  assert.equal(normaliseDob("not a date"), null);
});

test("only a four-digit PIN is a PIN", () => {
  assert.ok(validPin("0000"));
  assert.ok(validPin("4829"));
  for (const bad of ["", "123", "12345", "abcd", "12 34", "१२३४"]) {
    assert.ok(!validPin(bad), bad);
  }
});

test("the lockout is short enough to be usable and long enough to matter", () => {
  // Five tries against a 1-January-heavy population is already generous; the window
  // has to cost a guesser real time without stranding a farmer for the afternoon.
  assert.ok(MAX_ATTEMPTS <= 5, "too many attempts allowed");
  assert.ok(LOCKOUT_MS >= 15 * 60 * 1000, "lockout too short to slow anyone down");
  assert.ok(LOCKOUT_MS <= 60 * 60 * 1000, "lockout long enough to strand a farmer");
});

test("an emailed link expires quickly", () => {
  assert.ok(TOKEN_TTL_MS <= 60 * 60 * 1000);
});

test("guessing 1 January is not cheap", () => {
  // The threat this defends against, stated as arithmetic: rural records carry many
  // 1 January birth dates, so year alone is often the only unknown. With a 60-year
  // range and a lockout every five tries, a guesser needs hours, not minutes.
  const yearsToTry = 60;
  const lockouts = Math.floor(yearsToTry / MAX_ATTEMPTS);
  const hours = (lockouts * LOCKOUT_MS) / 3_600_000;
  assert.ok(hours >= 5, `only ${hours.toFixed(1)}h to walk 60 years of 1 January`);
});

test("an email check that rejects any address containing an s is broken", () => {
  // Exactly the bug shell-escaping introduced once: `[^\s@]` became `[^s@]`, which
  // silently refuses ramesh@, suresh@, kisan@ — a large share of the names this app
  // is for. Worth a permanent test because the failure looks like a typo by the user.
  assert.ok(validEmail("ramesh@example.com"));
  assert.ok(validEmail("suresh.patil@kisan.in"));
  assert.ok(validEmail("s@s.in"));
});

test("an email check still catches a real typo", () => {
  for (const bad of ["", "naam", "naam@", "@example.com", "naam@example", "a b@c.in"]) {
    assert.ok(!validEmail(bad), bad);
  }
});
