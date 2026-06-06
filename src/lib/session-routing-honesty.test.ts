import test from "node:test";
import assert from "node:assert/strict";

import type { ResolvedInternalChannel } from "./channel-workflow.ts";
import type { AudioDiscoveryDevice } from "../types/discovery.ts";
import type { AudioSessionView } from "../types/session-view.ts";
import {
  summarizeRoutingMatch,
  summarizeSessionRoutingHonesty,
} from "./session-routing-honesty.ts";

function resolvedChannel(
  channelId: "general" | "music" | "game" | "browser",
  label: string,
): ResolvedInternalChannel {
  return {
    channelId,
    channel: {
      id: channelId,
      label,
      description: label,
      defaultVolume: 70,
      bucket: channelId,
    },
    source: "manual",
    assignment: null,
    rule: null,
  };
}

function session(overrides: Partial<AudioSessionView> = {}): AudioSessionView {
  return {
    id: "session-1",
    sessionId: "sid-1",
    sessionInstanceId: "iid-1",
    groupingParam: null,
    displayName: "Microsoft Edge",
    processId: 1001,
    processName: "msedge.exe",
    executablePath: "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    appUserModelId: null,
    packageFullName: null,
    packageFamilyName: null,
    deviceId: "browser-endpoint-id",
    state: "active",
    volume: 42,
    muted: false,
    isSystemSounds: false,
    routeIntent: "audapp",
    routeIntentKey: "route-key",
    routeStatus: null,
    ...overrides,
  };
}

function outputDevice(id: string, name: string): AudioDiscoveryDevice {
  return {
    id,
    name,
    kind: "output",
    state: "active",
    isDefault: false,
  };
}

test("keeps requested Audapp channel separate from the actual Windows endpoint", () => {
  const summary = summarizeSessionRoutingHonesty(
    session(),
    resolvedChannel("music", "Audapp Music"),
    [outputDevice("browser-endpoint-id", "Hoparlor (Audapp Browser)")],
  );

  assert.equal(summary.requestedChannelLabel, "Audapp Music");
  assert.equal(summary.actualEndpointLabel, "Hoparlor (Audapp Browser)");
  assert.notEqual(summary.requestedChannelLabel, summary.actualEndpointLabel);
  assert.equal(summary.actualEndpointKnown, true);
});

test("prefers the applied Windows endpoint name when route status reports one", () => {
  const summary = summarizeSessionRoutingHonesty(
    session({
      deviceId: "stale-id",
      routeStatus: {
        applyStatus: "applied",
        appliedEndpointId: "game-endpoint-id",
        appliedEndpointName: "Hoparlor (Audapp Game)",
        lastError: null,
        note: null,
      },
    }),
    resolvedChannel("browser", "Audapp Browser"),
    [outputDevice("stale-id", "Speakers (USB Audio Device)")],
  );

  assert.equal(summary.requestedChannelLabel, "Audapp Browser");
  assert.equal(summary.actualEndpointLabel, "Hoparlor (Audapp Game)");
  assert.equal(summary.actualEndpointKnown, true);
});

test("marks the actual endpoint as unknown when Windows does not report one", () => {
  const summary = summarizeSessionRoutingHonesty(
    session({ deviceId: null }),
    resolvedChannel("general", "Audapp General"),
    [],
  );

  assert.equal(summary.actualEndpointLabel, "Unknown Windows endpoint");
  assert.equal(summary.actualEndpointKnown, false);
});

test("routing match: requested channel equals the actual endpoint", () => {
  const match = summarizeRoutingMatch("browser", {
    requestedChannelLabel: "Audapp Browser",
    actualEndpointLabel: "Hoparlor (Audapp Browser)",
    actualEndpointKnown: true,
  });
  assert.equal(match.matches, true);
  assert.equal(match.status, "ok");
  assert.equal(match.helperText, null);
});

test("routing match: a different Audapp endpoint needs a manual Volume Mixer move", () => {
  const match = summarizeRoutingMatch("general", {
    requestedChannelLabel: "Audapp General",
    actualEndpointLabel: "Hoparlor (Audapp Browser)",
    actualEndpointKnown: true,
  });
  assert.equal(match.matches, false);
  assert.equal(match.status, "warning");
  assert.match(match.helperText ?? "", /Volume Mixer/);
});

test("routing match: a non-Audapp output is reported as informational", () => {
  const match = summarizeRoutingMatch("music", {
    requestedChannelLabel: "Audapp Music",
    actualEndpointLabel: "Speakers (Realtek Audio)",
    actualEndpointKnown: true,
  });
  assert.equal(match.matches, false);
  assert.equal(match.status, "info");
});

test("routing match: an unknown output is neutral with no guidance", () => {
  const match = summarizeRoutingMatch("general", {
    requestedChannelLabel: "Audapp General",
    actualEndpointLabel: "Unknown Windows endpoint",
    actualEndpointKnown: false,
  });
  assert.equal(match.status, "neutral");
  assert.equal(match.helperText, null);
});
