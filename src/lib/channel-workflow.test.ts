import test from "node:test";
import assert from "node:assert/strict";

import type { AudioDiscoverySession } from "../types/discovery.ts";
import type { ChannelAssignment, ChannelRule } from "../types/session-control.ts";
import {
  getChannelRuleMatchLabel,
  getInternalChannelById,
  resolveInternalChannelForSession,
} from "./channel-workflow.ts";

function createSession(
  overrides: Partial<AudioDiscoverySession> = {},
): AudioDiscoverySession {
  return {
    id: "session-1",
    sessionId: "sid-1",
    sessionInstanceId: "iid-1",
    displayName: "Example App",
    processId: 1001,
    processName: "example.exe",
    executablePath: "C:\\Apps\\Example\\example.exe",
    deviceId: "device-1",
    state: "active",
    volume: 50,
    muted: false,
    isSystemSounds: false,
    ...overrides,
  };
}

function createAssignment(
  channelId: ChannelAssignment["channelId"],
  match: ChannelAssignment["match"],
): ChannelAssignment {
  return {
    id: "assignment-1",
    channelId,
    match,
    label: "Manual",
    createdAt: "2026-06-04T00:00:00Z",
    updatedAt: "2026-06-04T00:00:00Z",
  };
}

function createRule(overrides: Partial<ChannelRule> = {}): ChannelRule {
  return {
    id: "rule-1",
    enabled: true,
    matchType: "process_contains",
    pattern: "spotify",
    channelId: "music",
    priority: 100,
    createdAt: "2026-06-04T00:00:00Z",
    updatedAt: "2026-06-04T00:00:00Z",
    ...overrides,
  };
}

test("prefers a manual assignment when a known internal channel is stored", () => {
  const session = createSession({ processName: "discord.exe" });
  const assignment = createAssignment("game", {
    executablePath: session.executablePath,
    processName: session.processName,
  });

  const resolved = resolveInternalChannelForSession(session, assignment);

  assert.equal(resolved.channel.id, "game");
  assert.equal(resolved.source, "manual");
});

test("defaults Spotify sessions to Audapp Music", () => {
  const session = createSession({
    displayName: "Spotify",
    processName: "spotify.exe",
  });

  const resolved = resolveInternalChannelForSession(session, null);

  assert.equal(resolved.channel.id, "music");
  assert.equal(resolved.source, "smart_default");
});

test("defaults browser apps to Audapp Browser", () => {
  for (const processName of [
    "chrome.exe",
    "msedge.exe",
    "firefox.exe",
    "brave.exe",
    "opera.exe",
  ]) {
    const session = createSession({ displayName: processName, processName });
    const resolved = resolveInternalChannelForSession(session, null);

    assert.equal(resolved.channel.id, "browser", `${processName} should map to browser`);
    assert.equal(resolved.source, "smart_default");
  }
});

test("routes Discord-class apps to Audapp General (no voice output channel)", () => {
  const session = createSession({
    displayName: "Discord",
    processName: "discord.exe",
  });

  const resolved = resolveInternalChannelForSession(session, null);

  assert.equal(resolved.channel.id, "general");
  assert.equal(resolved.source, "smart_default");
});

test("uses Audapp General smart default for ordinary apps", () => {
  const session = createSession({
    displayName: "Notepad",
    processName: "notepad.exe",
  });

  const resolved = resolveInternalChannelForSession(session, null);

  assert.equal(resolved.channel.id, "general");
  assert.equal(resolved.source, "smart_default");
});

test("falls back to Audapp General when there is not enough identity to infer a smart default", () => {
  const session = createSession({
    displayName: "",
    processName: null,
    executablePath: null,
  });

  const resolved = resolveInternalChannelForSession(session, null);

  assert.equal(resolved.channel.id, "general");
  assert.equal(resolved.source, "fallback");
  assert.equal(getInternalChannelById("general")?.label, "Audapp General");
});

test("uses a matching rule when no manual assignment is present", () => {
  const session = createSession({
    displayName: "Browser",
    processName: "msedge.exe",
  });

  const resolved = resolveInternalChannelForSession(session, null, [
    createRule({
      matchType: "process_contains",
      pattern: "edge",
      channelId: "music",
    }),
  ]);

  assert.equal(resolved.channel.id, "music");
  assert.equal(resolved.source, "rule");
  assert.equal(resolved.rule?.id, "rule-1");
});

test("prefers manual assignment over matching rules", () => {
  const session = createSession({
    displayName: "Spotify",
    processName: "spotify.exe",
  });
  const assignment = createAssignment("game", {
    executablePath: session.executablePath,
    processName: session.processName,
  });

  const resolved = resolveInternalChannelForSession(session, assignment, [
    createRule({
      channelId: "music",
      pattern: "spotify",
    }),
  ]);

  assert.equal(resolved.channel.id, "game");
  assert.equal(resolved.source, "manual");
  assert.equal(resolved.rule, null);
});

test("prefers the highest-priority rule when multiple match", () => {
  const session = createSession({
    displayName: "Discord",
    processName: "discord.exe",
  });

  const resolved = resolveInternalChannelForSession(session, null, [
    createRule({
      id: "rule-low",
      priority: 200,
      pattern: "discord",
      channelId: "game",
    }),
    createRule({
      id: "rule-high",
      priority: 10,
      pattern: "discord",
      channelId: "browser",
    }),
  ]);

  assert.equal(resolved.channel.id, "browser");
  assert.equal(resolved.source, "rule");
  assert.equal(resolved.rule?.id, "rule-high");
});

test("ignores disabled rules and falls back to smart defaults", () => {
  const session = createSession({
    displayName: "Spotify",
    processName: "spotify.exe",
  });

  const resolved = resolveInternalChannelForSession(session, null, [
    createRule({
      enabled: false,
      pattern: "spotify",
      channelId: "game",
    }),
  ]);

  assert.equal(resolved.channel.id, "music");
  assert.equal(resolved.source, "smart_default");
});

test("matches session name contains rules", () => {
  const session = createSession({
    displayName: "Daily Standup - Teams",
    processName: "ms-teams.exe",
  });

  const resolved = resolveInternalChannelForSession(session, null, [
    createRule({
      matchType: "session_name_contains",
      pattern: "standup",
      channelId: "browser",
    }),
  ]);

  assert.equal(resolved.channel.id, "browser");
  assert.equal(resolved.source, "rule");
});

test("labels channel rule match types for compact UI copy", () => {
  assert.equal(getChannelRuleMatchLabel("process_contains"), "process contains");
  assert.equal(getChannelRuleMatchLabel("process_equals"), "process equals");
  assert.equal(getChannelRuleMatchLabel("session_name_contains"), "session name contains");
});
