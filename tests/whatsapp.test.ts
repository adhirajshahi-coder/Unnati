/**
 * Tests for the WhatsApp channel.
 *
 * Three things here fail silently if they are wrong, which is why they are pinned
 * down: a mis-normalised number messages a stranger, a mis-read service window gets
 * every message rejected by Meta, and out-of-order delivery receipts make the ops
 * view claim a message was merely sent when the farmer has already read it.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { toWaId } from "../src/lib/whatsapp/client";
import {
  TEMPLATES,
  TEMPLATE_FOR,
  renderTemplate,
  paramsValid,
} from "../src/lib/whatsapp/templates";
import { insideServiceWindow, SERVICE_WINDOW_MS } from "../src/lib/whatsapp";

describe("phone numbers", () => {
  test("a plain 10-digit Indian mobile gets the country code", () => {
    assert.equal(toWaId("9000000011"), "919000000011");
  });

  test("the ways people actually type a number all land on the same id", () => {
    const expected = "919812345678";
    for (const written of [
      "9812345678",
      "09812345678",
      "919812345678",
      "+91 98123 45678",
      "+91-98123-45678",
      " 98123 45678 ",
    ]) {
      assert.equal(toWaId(written), expected, `failed on "${written}"`);
    }
  });

  test("a landline or short code is refused rather than guessed at", () => {
    // Indian mobiles start 6-9. Guessing here means messaging a stranger.
    for (const bad of ["1123456789", "5551234567", "12345", "", "abcdefghij"]) {
      assert.equal(toWaId(bad), null, `expected "${bad}" to be refused`);
    }
  });

  test("a number of the wrong length is refused", () => {
    assert.equal(toWaId("98123456789"), null);
    assert.equal(toWaId("981234567"), null);
  });
});

describe("the 24-hour service window", () => {
  test("no inbound message means the window is shut", () => {
    // Everything must then be a pre-approved template.
    assert.equal(insideServiceWindow(null), false);
  });

  test("a message minutes ago leaves it open", () => {
    assert.equal(
      insideServiceWindow(new Date(Date.now() - 5 * 60_000)),
      true,
    );
  });

  test("just inside 24 hours is still open", () => {
    assert.equal(
      insideServiceWindow(new Date(Date.now() - (SERVICE_WINDOW_MS - 60_000))),
      true,
    );
  });

  test("just past 24 hours is shut", () => {
    assert.equal(
      insideServiceWindow(new Date(Date.now() - (SERVICE_WINDOW_MS + 60_000))),
      false,
    );
  });
});

describe("templates", () => {
  test("every notification type this app raises maps to a decision", () => {
    // A type missing from the map would silently never reach WhatsApp.
    for (const type of [
      "PRICE_ALERT",
      "POOLING_ALERT",
      "BILLING_REMINDER",
      "TRIP_UPDATE",
      "SPOILAGE_WARNING",
      "SYSTEM",
      "WELCOME",
    ]) {
      assert.ok(type in TEMPLATE_FOR, `${type} has no mapping`);
    }
  });

  test("housekeeping messages deliberately have no template", () => {
    assert.equal(TEMPLATE_FOR.SYSTEM, null);
  });

  test("each template declares as many parameters as its body uses", () => {
    for (const spec of Object.values(TEMPLATES)) {
      for (const lang of ["en", "hi"] as const) {
        const used = new Set(
          [...spec.body[lang].matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]),
        );
        assert.equal(
          used.size,
          spec.params.length,
          `${spec.name} (${lang}) uses ${used.size} variables but declares ${spec.params.length}`,
        );
      }
    }
  });

  test("both languages of a template use the same variable numbers", () => {
    // Meta registers one variable count per template across languages; a mismatch
    // means one language is rejected at review and nobody notices until it matters.
    for (const spec of Object.values(TEMPLATES)) {
      const vars = (s: string) =>
        [...s.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]).sort().join(",");
      assert.equal(
        vars(spec.body.en),
        vars(spec.body.hi),
        `${spec.name} differs between languages`,
      );
    }
  });

  test("rendering substitutes parameters in order", () => {
    const out = renderTemplate("billing_reminder", "en", [
      "₹1,866",
      "29 Sept",
      "transport to Noida APMC",
    ]);
    assert.ok(out.includes("₹1,866"));
    assert.ok(out.includes("29 Sept"));
    assert.ok(out.includes("transport to Noida APMC"));
    assert.ok(!out.includes("{{"), "no placeholder should survive");
  });

  test("Hindi renders too, with the same values", () => {
    const out = renderTemplate("pooling_alert", "hi", [
      "नोएडा मंडी",
      "3",
      "26 क्विंटल",
    ]);
    assert.ok(out.includes("नोएडा मंडी"));
    assert.ok(out.includes("26 क्विंटल"));
    assert.ok(!out.includes("{{"));
  });

  test("a wrong parameter count is caught before Meta rejects it", () => {
    assert.equal(paramsValid("billing_reminder", ["a", "b", "c"]), true);
    assert.equal(paramsValid("billing_reminder", ["a", "b"]), false);
    assert.equal(paramsValid("billing_reminder", ["a", "b", "c", "d"]), false);
  });

  test("template names are unique and in Meta's required casing", () => {
    const names = Object.values(TEMPLATES).map((s) => s.name);
    assert.equal(new Set(names).size, names.length, "duplicate template name");
    for (const n of names) {
      assert.match(n, /^[a-z0-9_]+$/, `${n} is not lower snake case`);
    }
  });
});

/* ------------------------------------------------- delivery receipt ordering */

/**
 * Mirrors the guard in `applyReceipt`. Meta delivers receipts out of order often
 * enough that a late "sent" arriving after "read" would otherwise walk a message
 * backwards and make the ops view lie about what the farmer has seen.
 */
const RANK = { QUEUED: 0, SKIPPED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };

function shouldApply(current: string, incoming: string): boolean {
  if (incoming === "FAILED") return true;
  return (
    RANK[incoming as keyof typeof RANK] > RANK[current as keyof typeof RANK]
  );
}

describe("delivery receipts arriving out of order", () => {
  test("progress forward is applied", () => {
    assert.equal(shouldApply("QUEUED", "SENT"), true);
    assert.equal(shouldApply("SENT", "DELIVERED"), true);
    assert.equal(shouldApply("DELIVERED", "READ"), true);
  });

  test("a late earlier receipt never walks the status backwards", () => {
    assert.equal(shouldApply("READ", "SENT"), false);
    assert.equal(shouldApply("READ", "DELIVERED"), false);
    assert.equal(shouldApply("DELIVERED", "SENT"), false);
  });

  test("the same receipt twice changes nothing", () => {
    assert.equal(shouldApply("DELIVERED", "DELIVERED"), false);
  });

  test("a failure is always recorded, whatever came before", () => {
    // A message can fail after being accepted — the handset is gone, the number is
    // no longer on WhatsApp — and that is exactly what someone needs to know.
    assert.equal(shouldApply("READ", "FAILED"), true);
    assert.equal(shouldApply("SENT", "FAILED"), true);
  });
});
