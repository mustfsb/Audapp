import test from "node:test";
import assert from "node:assert/strict";

import {
  FILLED_BADGE_VARIANTS,
  availabilityStatus,
  statusBadgeVariant,
  type StatusKind,
} from "./badge-variant.ts";

test("every status maps to a filled (non-outline) badge variant", () => {
  const kinds: StatusKind[] = ["ok", "warning", "error", "legacy", "info", "neutral"];
  for (const kind of kinds) {
    const variant = statusBadgeVariant(kind);
    assert.ok(
      FILLED_BADGE_VARIANTS.includes(variant),
      `${kind} -> ${variant} should be a filled variant`,
    );
    assert.notEqual(variant, "outline");
  }
});

test("semantic statuses map to their expected colors", () => {
  assert.equal(statusBadgeVariant("ok"), "success");
  assert.equal(statusBadgeVariant("warning"), "warning");
  assert.equal(statusBadgeVariant("error"), "destructive");
  assert.equal(statusBadgeVariant("info"), "info");
  assert.equal(statusBadgeVariant("legacy"), "secondary");
  assert.equal(statusBadgeVariant("neutral"), "secondary");
});

test("availabilityStatus distinguishes available from missing", () => {
  assert.equal(availabilityStatus(true), "ok");
  assert.equal(availabilityStatus(false), "error");
});
