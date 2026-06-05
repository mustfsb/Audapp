import test from "node:test";
import assert from "node:assert/strict";

import type { AudioDiscoveryDevice } from "../types/discovery.ts";
import {
  AUDAPP_OUTPUT_CHANNEL_IDS,
  classifyAudappEndpointByName,
  getAudappEndpointClass,
  summarizeAudappChannelEndpoints,
} from "./audapp-endpoints.ts";
import { INTERNAL_CHANNELS } from "./internal-channels.ts";

function outputDevice(
  name: string,
  overrides: Partial<AudioDiscoveryDevice> = {},
): AudioDiscoveryDevice {
  return {
    id: `id-${name}`,
    name,
    kind: "output",
    state: "active",
    isDefault: false,
    ...overrides,
  };
}

test("classifies the four AudappChannels outputs by friendly name", () => {
  const cases: Array<[string, string]> = [
    ["Hoparlör (Audapp General)", "general"],
    ["Hoparlör (Audapp Music)", "music"],
    ["Hoparlör (Audapp Game)", "game"],
    ["Hoparlör (Audapp Browser)", "browser"],
  ];

  for (const [name, channelId] of cases) {
    const result = classifyAudappEndpointByName(name);
    assert.equal(result.isAudappEndpoint, true, name);
    assert.equal(result.kind, "channel_output", name);
    assert.equal(result.channelId, channelId, name);
  }
});

test("classification ignores the localized device prefix", () => {
  assert.equal(classifyAudappEndpointByName("Speakers (Audapp Browser)").channelId, "browser");
  assert.equal(classifyAudappEndpointByName("AUDAPP MUSIC").channelId, "music");
});

test("classifies Audapp Input as input with no channel", () => {
  for (const name of ["Hoparlör (Audapp Input)", "Mikrofon (Audapp Input)"]) {
    const result = classifyAudappEndpointByName(name);
    assert.equal(result.kind, "input");
    assert.equal(result.channelId, null);
  }
});

test("classifies legacy Audapp Multi as stale", () => {
  const result = classifyAudappEndpointByName("Hoparlör (Audapp Multi)");
  assert.equal(result.kind, "legacy_multi");
  assert.equal(result.channelId, null);
});

test("non-Audapp endpoints are not flagged", () => {
  const result = classifyAudappEndpointByName("Hoparlör (High Definition Audio Device)");
  assert.equal(result.isAudappEndpoint, false);
  assert.equal(result.kind, null);
  assert.equal(result.channelId, null);
});

test("getAudappEndpointClass prefers backend-provided fields", () => {
  const device = outputDevice("Totally Renamed Endpoint", {
    isAudappEndpoint: true,
    audappEndpointKind: "channel_output",
    audappChannelId: "game",
  });

  const result = getAudappEndpointClass(device);
  assert.equal(result.kind, "channel_output");
  assert.equal(result.channelId, "game");
});

test("getAudappEndpointClass falls back to name when backend fields are absent", () => {
  const device = outputDevice("Hoparlör (Audapp Browser)");
  const result = getAudappEndpointClass(device);
  assert.equal(result.channelId, "browser");
});

test("summarizes endpoint availability for the four output channels", () => {
  const devices: AudioDiscoveryDevice[] = [
    outputDevice("Hoparlör (Audapp General)"),
    outputDevice("Hoparlör (Audapp Music)"),
    outputDevice("Hoparlör (Audapp Game)"),
    // Browser present but not active → should be reported missing.
    outputDevice("Hoparlör (Audapp Browser)", { state: "not_present" }),
    outputDevice("Hoparlör (High Definition Audio Device)", { isDefault: true }),
  ];

  const summary = summarizeAudappChannelEndpoints(devices);
  assert.equal(summary.length, 4);

  const byId = Object.fromEntries(summary.map((entry) => [entry.channelId, entry]));
  assert.equal(byId.general.available, true);
  assert.equal(byId.music.available, true);
  assert.equal(byId.game.available, true);
  assert.equal(byId.browser.available, false);
  assert.equal(byId.general.deviceName, "Hoparlör (Audapp General)");
});

test("internal output channels are general/music/game/browser with no voice", () => {
  const ids = INTERNAL_CHANNELS.map((channel) => channel.id);
  assert.deepEqual(ids, ["general", "music", "game", "browser"]);
  assert.deepEqual([...AUDAPP_OUTPUT_CHANNEL_IDS], ["general", "music", "game", "browser"]);
  assert.equal(ids.includes("voice" as never), false);
});
