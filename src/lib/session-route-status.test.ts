import test from "node:test";
import assert from "node:assert/strict";

import type { AudioSessionView } from "../types/session-view.ts";
import type { SessionRouteCapability } from "../types/session-control.ts";
import { deriveSessionRouteStatus } from "./session-route-status.ts";

function createSession(
  overrides: Partial<AudioSessionView> = {},
): AudioSessionView {
  return {
    id: "session-1",
    sessionId: "sid-1",
    sessionInstanceId: "iid-1",
    displayName: "Microsoft Edge",
    processId: 1001,
    processName: "msedge.exe",
    executablePath: "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    deviceId: "{0.0.0.00000000}.{device-1}",
    state: "active",
    volume: 42,
    muted: false,
    isSystemSounds: false,
    routeIntent: "audapp",
    routeIntentKey: "device-1::sid-1::iid-1::1001",
    routeStatus: null,
    ...overrides,
  };
}

function createCapability(
  overrides: Partial<SessionRouteCapability> = {},
): SessionRouteCapability {
  return {
    perAppSwitchingSupported: false,
    supportScope: "unsupported",
    statusReason:
      "Windows per-app output switching is not available through the current safe API path yet.",
    manualFallback:
      "Windows Settings -> Sound -> Volume mixer -> choose app output device",
    inspectedStorage:
      "HKCU\\Software\\Microsoft\\Internet Explorer\\LowRegistry\\Audio\\PolicyConfig\\PropertyStore",
    ...overrides,
  };
}

test("marks audapp intent as unsupported when safe per-app routing is unavailable", () => {
  const status = deriveSessionRouteStatus(createSession(), createCapability());

  assert.equal(status.applyStatus, "unsupported");
  assert.equal(status.appliedEndpointName, null);
  assert.match(status.lastError ?? "", /not available/i);
});

test("marks bypass intent as unsupported when safe per-app routing is unavailable", () => {
  const status = deriveSessionRouteStatus(
    createSession({ routeIntent: "bypass" }),
    createCapability(),
  );

  assert.equal(status.applyStatus, "unsupported");
  assert.equal(status.appliedEndpointId, null);
});

test("keeps monitor_only as ui_only even when switching is unsupported", () => {
  const status = deriveSessionRouteStatus(
    createSession({ routeIntent: "monitor_only" }),
    createCapability(),
  );

  assert.equal(status.applyStatus, "ui_only");
  assert.equal(status.lastError, null);
});

test("treats system as ui_only when no safe per-app override API exists", () => {
  const status = deriveSessionRouteStatus(
    createSession({ routeIntent: "system" }),
    createCapability(),
  );

  assert.equal(status.applyStatus, "ui_only");
  assert.match(status.note ?? "", /follows windows default/i);
});
