import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_EQ_CHANNEL,
  EQ_CHANNELS,
  channelLabel,
  defaultChannelDspConfig,
  withBandGain,
} from "./channel-eq.ts";

test("equalizer channel selector defaults to General", () => {
  assert.equal(DEFAULT_EQ_CHANNEL, "general");
  assert.equal(EQ_CHANNELS[0]?.id, "general");
});

test("all four channels are present with clean labels", () => {
  const ids = EQ_CHANNELS.map((channel) => channel.id);
  assert.deepEqual(ids, ["general", "music", "game", "browser"]);
  assert.equal(channelLabel("general"), "General");
  assert.equal(channelLabel("music"), "Music");
  assert.equal(channelLabel("game"), "Game");
  assert.equal(channelLabel("browser"), "Browser");
});

test("channelLabel falls back to the raw id for unknown channels", () => {
  assert.equal(channelLabel("unknown"), "unknown");
});

test("default per-channel config is enabled, flat and has five EQ bands", () => {
  const config = defaultChannelDspConfig();
  assert.equal(config.enabled, true);
  assert.equal(config.outputGainDb, 0);
  assert.equal(config.eqEnabled, false);
  assert.equal(config.eqPreset, "flat");
  assert.equal(config.eqBands.length, 5);
  assert.ok(config.eqBands.every((band) => band.gainDb === 0));
});

test("each defaultChannelDspConfig call returns an independent object", () => {
  const a = defaultChannelDspConfig();
  const b = defaultChannelDspConfig();
  assert.notEqual(a, b);
  assert.notEqual(a.eqBands, b.eqBands);
});

test("editing Browser EQ does not change Music config", () => {
  // Independent per-channel configs, like the Equalizer keeps per channel.
  const music = defaultChannelDspConfig();
  const browser = defaultChannelDspConfig();

  const editedBrowser = withBandGain(browser, 0, 6);

  // Browser changed...
  assert.equal(editedBrowser.eqBands[0]?.gainDb, 6);
  assert.equal(editedBrowser.eqPreset, "custom");

  // ...and Music is completely untouched.
  assert.equal(music.eqBands[0]?.gainDb, 0);
  assert.equal(music.eqPreset, "flat");

  // The original browser object was not mutated either (immutability).
  assert.equal(browser.eqBands[0]?.gainDb, 0);
  assert.equal(browser.eqPreset, "flat");
});

test("withBandGain only changes the targeted band", () => {
  const config = defaultChannelDspConfig();
  const edited = withBandGain(config, 2, -4.5);
  assert.equal(edited.eqBands[2]?.gainDb, -4.5);
  assert.equal(edited.eqBands[0]?.gainDb, 0);
  assert.equal(edited.eqBands[1]?.gainDb, 0);
  assert.equal(edited.eqBands[3]?.gainDb, 0);
  assert.equal(edited.eqBands[4]?.gainDb, 0);
});
