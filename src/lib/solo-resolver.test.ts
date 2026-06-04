import test from "node:test";
import assert from "node:assert/strict";

import { computeSoloState, toggleSoloInSet } from "./solo-resolver.ts";

const ALL_CHANNELS = ["general", "music", "voice", "game"];

// ---- computeSoloState ----

test("no channel soloed → soloActive=false, mutedBySoloIds is empty", () => {
  const result = computeSoloState(ALL_CHANNELS, new Set());
  assert.equal(result.soloActive, false);
  assert.equal(result.mutedBySoloIds.size, 0);
  assert.equal(result.soloedIds.size, 0);
});

test("solo Music → General/Voice/Game are muted-by-solo", () => {
  const result = computeSoloState(ALL_CHANNELS, new Set(["music"]));
  assert.equal(result.soloActive, true);
  assert.ok(result.soloedIds.has("music"));
  assert.ok(result.mutedBySoloIds.has("general"));
  assert.ok(result.mutedBySoloIds.has("voice"));
  assert.ok(result.mutedBySoloIds.has("game"));
  assert.equal(result.mutedBySoloIds.has("music"), false);
});

test("solo Music + Voice → General/Game are muted-by-solo", () => {
  const result = computeSoloState(ALL_CHANNELS, new Set(["music", "voice"]));
  assert.equal(result.soloActive, true);
  assert.ok(result.mutedBySoloIds.has("general"));
  assert.ok(result.mutedBySoloIds.has("game"));
  assert.equal(result.mutedBySoloIds.has("music"), false);
  assert.equal(result.mutedBySoloIds.has("voice"), false);
});

test("solo all channels → mutedBySoloIds is empty", () => {
  const result = computeSoloState(ALL_CHANNELS, new Set(ALL_CHANNELS));
  assert.equal(result.soloActive, true);
  assert.equal(result.mutedBySoloIds.size, 0);
});

test("mutedBySoloIds + soloedIds together cover all channels when solo is active", () => {
  const soloed = new Set(["music"]);
  const result = computeSoloState(ALL_CHANNELS, soloed);
  const union = new Set([...result.soloedIds, ...result.mutedBySoloIds]);
  for (const id of ALL_CHANNELS) {
    assert.ok(union.has(id), `${id} should be covered`);
  }
});

// ---- toggleSoloInSet ----

test("toggleSoloInSet adds a channel that is not yet soloed", () => {
  const result = toggleSoloInSet(new Set(), "music");
  assert.ok(result.has("music"));
  assert.equal(result.size, 1);
});

test("toggleSoloInSet removes a channel that is already soloed", () => {
  const result = toggleSoloInSet(new Set(["music"]), "music");
  assert.equal(result.has("music"), false);
  assert.equal(result.size, 0);
});

test("toggleSoloInSet does not mutate the input set", () => {
  const original = new Set(["music"]);
  toggleSoloInSet(original, "voice");
  assert.equal(original.size, 1); // unchanged
  assert.equal(original.has("voice"), false);
});
