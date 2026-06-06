import test from "node:test";
import assert from "node:assert/strict";

import type { AudioDiscoverySession } from "../types/discovery.ts";
import {
  appGroupDisplayName,
  appIdentityKey,
  groupSessionsIntoApps,
  normalizeExecutableName,
} from "./app-session-group.ts";

function session(overrides: Partial<AudioDiscoverySession> = {}): AudioDiscoverySession {
  return {
    id: `id-${Math.random()}`,
    sessionId: null,
    sessionInstanceId: null,
    displayName: "Microsoft Edge",
    processId: 100,
    processName: "msedge.exe",
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    deviceId: "device-a",
    state: "active",
    volume: 100,
    muted: false,
    isSystemSounds: false,
    ...overrides,
  };
}

test("multiple msedge sessions collapse into one Microsoft Edge app", () => {
  const groups = groupSessionsIntoApps([
    session({ id: "edge-1", processId: 11, displayName: "New Tab - Microsoft Edge" }),
    session({ id: "edge-2", processId: 22, displayName: "YouTube - Microsoft Edge" }),
    session({ id: "edge-3", processId: 22, displayName: "YouTube - Microsoft Edge" }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].displayName, "Microsoft Edge");
  assert.equal(groups[0].sessionCount, 3);
});

test("different browsers stay as separate apps", () => {
  const groups = groupSessionsIntoApps([
    session({ id: "edge", processName: "msedge.exe", executablePath: "C:\\edge\\msedge.exe" }),
    session({
      id: "chrome",
      processName: "chrome.exe",
      executablePath: "C:\\chrome\\chrome.exe",
      displayName: "Google Chrome",
    }),
  ]);

  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((group) => group.displayName).sort(),
    ["Google Chrome", "Microsoft Edge"],
  );
});

test("a group is muted only when every controllable session is muted", () => {
  const allMuted = groupSessionsIntoApps([
    session({ id: "a", processId: 1, muted: true }),
    session({ id: "b", processId: 2, muted: true }),
  ]);
  assert.equal(allMuted[0].muted, true);

  const partial = groupSessionsIntoApps([
    session({ id: "a", processId: 1, muted: true }),
    session({ id: "b", processId: 2, muted: false }),
  ]);
  assert.equal(partial[0].muted, false);
});

test("sessions grouped by process name when the executable path is missing", () => {
  const groups = groupSessionsIntoApps([
    session({ id: "a", executablePath: null, processId: 1 }),
    session({ id: "b", executablePath: null, processId: 2 }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].sessionCount, 2);
});

test("packaged apps group by AppUserModelId even with different executables", () => {
  const groups = groupSessionsIntoApps([
    session({
      id: "a",
      appUserModelId: "Microsoft.WindowsStore_8wekyb3d8bbwe!App",
      executablePath: "C:\\one\\a.exe",
      processName: "a.exe",
      displayName: "Store",
    }),
    session({
      id: "b",
      appUserModelId: "Microsoft.WindowsStore_8wekyb3d8bbwe!App",
      executablePath: "C:\\two\\b.exe",
      processName: "b.exe",
      displayName: "Store",
    }),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].sessionCount, 2);
});

test("representative prefers a controllable session", () => {
  const groups = groupSessionsIntoApps([
    session({ id: "expired", processId: 1, state: "expired", deviceId: null }),
    session({ id: "live", processId: 2, state: "active", deviceId: "device-a" }),
  ]);

  assert.equal(groups[0].representative.id, "live");
  assert.equal(groups[0].anyControllable, true);
});

test("identity key prefers stable identifiers over the pid", () => {
  const byPath = appIdentityKey(session({ executablePath: "C:\\x\\msedge.exe" }));
  assert.match(byPath, /^path:/);

  const byPid = appIdentityKey(
    session({ executablePath: null, processName: null, processId: 4242 }),
  );
  assert.equal(byPid, "pid:4242");
});

test("normalizeExecutableName strips path and extension", () => {
  assert.equal(normalizeExecutableName("MSEDGE.EXE"), "msedge");
  assert.equal(normalizeExecutableName(null, "C:\\a\\b\\Chrome.exe"), "chrome");
  assert.equal(normalizeExecutableName(null, null), null);
});

test("system sounds keep a readable name", () => {
  const name = appGroupDisplayName(
    session({ processName: null, executablePath: null, displayName: "", isSystemSounds: true }),
  );
  assert.equal(name, "System Sounds");
});
