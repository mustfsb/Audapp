import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEqualizerViewModel,
  EQ_PRESET_CONTENT_CLASSNAME,
  EQ_PRESET_TRIGGER_CLASSNAME,
} from "./equalizer-view-model.ts";

test("equalizer main view exposes one visible editor only", () => {
  const view = buildEqualizerViewModel("general");

  assert.equal(view.selectedChannel.id, "general");
  assert.equal(view.visibleEditorCount, 1);
  assert.deepEqual(view.visibleEditors, ["channel"]);
  assert.equal(view.masterPanelVisible, false);
  assert.equal(view.advancedSectionId, "master-output-protection");
});

test("switching the selected channel swaps the single editor target", () => {
  const general = buildEqualizerViewModel("general");
  const browser = buildEqualizerViewModel("browser");

  assert.equal(general.selectedChannel.label, "General");
  assert.equal(browser.selectedChannel.label, "Browser");
  assert.equal(browser.visibleEditorCount, 1);
  assert.equal(browser.editorTargetChannelId, "browser");
});

test("preset dropdown classes keep the softer product styling", () => {
  assert.match(EQ_PRESET_TRIGGER_CLASSNAME, /rounded-xl/);
  assert.match(EQ_PRESET_TRIGGER_CLASSNAME, /bg-card\/80/);
  assert.match(EQ_PRESET_CONTENT_CLASSNAME, /rounded-xl/);
  assert.match(EQ_PRESET_CONTENT_CLASSNAME, /shadow-xl/);
});
