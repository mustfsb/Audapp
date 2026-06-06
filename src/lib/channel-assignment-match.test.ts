import test from "node:test";
import assert from "node:assert/strict";

import type { AudioDiscoverySession } from "../types/discovery.ts";
import type { ChannelAssignment, ChannelAssignmentMatch } from "../types/session-control.ts";
import {
  assignmentMatchKey,
  dropAssignmentsForSession,
  selectAssignmentForSession,
  upsertAssignmentLocally,
} from "./channel-assignment-match.ts";
import { resolveInternalChannelForSession } from "./channel-workflow.ts";
import { assignmentMatchFromSession } from "./session-target.ts";

function msedgeSession(overrides: Partial<AudioDiscoverySession> = {}): AudioDiscoverySession {
  return {
    id: "device-a::edge-inst",
    sessionId: "edge-sid",
    sessionInstanceId: "edge-iid",
    displayName: "Microsoft Edge",
    processId: 4242,
    processName: "msedge.exe",
    executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    deviceId: "device-a",
    state: "active",
    volume: 60,
    muted: false,
    isSystemSounds: false,
    ...overrides,
  };
}

function assignmentFor(
  session: AudioDiscoverySession,
  channelId: ChannelAssignment["channelId"],
  idSuffix = "1",
): ChannelAssignment {
  return {
    id: `assignment-${idSuffix}`,
    channelId,
    match: assignmentMatchFromSession(session) as ChannelAssignmentMatch,
    label: "Manual",
    createdAt: "2026-06-05T00:00:00Z",
    updatedAt: "2026-06-05T00:00:00Z",
  };
}

test("manual msedge -> general beats the browser smart default", () => {
  const session = msedgeSession();
  const manual = assignmentFor(session, "general");

  const matched = selectAssignmentForSession([manual], session);
  assert.equal(matched?.channelId, "general");

  const resolved = resolveInternalChannelForSession(session, matched);
  assert.equal(resolved.channel.id, "general");
  assert.equal(resolved.source, "manual");
});

test("resetting the manual assignment returns msedge to the Browser smart default", () => {
  const session = msedgeSession();

  // After removal there is no assignment to match.
  const matched = selectAssignmentForSession([], session);
  assert.equal(matched, null);

  const resolved = resolveInternalChannelForSession(session, matched);
  assert.equal(resolved.channel.id, "browser");
  assert.equal(resolved.source, "smart_default");
});

test("manual override persists across a discovery refresh that changes the audio pid", () => {
  const original = msedgeSession({ processId: 4242 });
  const manual = assignmentFor(original, "general");

  // Edge frequently moves its audio to a different process id between refreshes;
  // the stable executable path must keep the manual override matching.
  const refreshed = msedgeSession({
    id: "device-a::edge-inst-2",
    processId: 9999,
    displayName: "New Tab - Microsoft Edge",
  });

  const matched = selectAssignmentForSession([manual], refreshed);
  assert.equal(matched?.channelId, "general");
  assert.equal(resolveInternalChannelForSession(refreshed, matched).source, "manual");
});

test("manual override still matches when only the process name is stable", () => {
  const session = msedgeSession({ executablePath: null });
  const manual = assignmentFor(session, "music");

  const refreshed = msedgeSession({ executablePath: null, processId: 5151 });
  const matched = selectAssignmentForSession([manual], refreshed);
  assert.equal(matched?.channelId, "music");
});

test("upsertAssignmentLocally replaces an existing assignment by match identity", () => {
  const session = msedgeSession();
  const browser = assignmentFor(session, "browser", "old");
  const general = assignmentFor(session, "general", "new");

  // Same match tuple -> replace in place, no duplicate.
  const merged = upsertAssignmentLocally([browser], general);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].channelId, "general");
  assert.equal(
    assignmentMatchKey(merged[0].match),
    assignmentMatchKey(assignmentMatchFromSession(session) as ChannelAssignmentMatch),
  );
});

test("a newer optimistic override wins over a stale same-app assignment", () => {
  const session = msedgeSession();

  // The stored assignment (browser) was captured earlier with a different tab
  // title; the optimistic general override is applied "now" and must win even
  // though both match the same executable path.
  const stale: ChannelAssignment = {
    ...assignmentFor(session, "browser", "stale"),
    match: assignmentMatchFromSession(
      msedgeSession({ displayName: "Old Tab", processId: 1 }),
    ) as ChannelAssignmentMatch,
    updatedAt: "2026-06-05T10:00:00Z",
  };
  const optimistic: ChannelAssignment = {
    ...assignmentFor(session, "general", "fresh"),
    updatedAt: "2026-06-05T10:05:00Z",
  };

  const matched = selectAssignmentForSession([stale, optimistic], session);
  assert.equal(matched?.channelId, "general");

  const resolved = resolveInternalChannelForSession(session, matched);
  assert.equal(resolved.channel.id, "general");
  assert.equal(resolved.source, "manual");
});

test("dropAssignmentsForSession removes every assignment matching the app", () => {
  const edge = msedgeSession();
  const spotify = msedgeSession({
    id: "spotify",
    processName: "spotify.exe",
    executablePath: "C:\\Spotify\\Spotify.exe",
    displayName: "Spotify",
    processId: 700,
  });

  const edgeAssignment = assignmentFor(edge, "browser", "edge");
  const spotifyAssignment = assignmentFor(spotify, "music", "spotify");

  const remaining = dropAssignmentsForSession([edgeAssignment, spotifyAssignment], edge);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].channelId, "music");
});

test("upsertAssignmentLocally appends a distinct app without touching others", () => {
  const edge = msedgeSession();
  const spotify = msedgeSession({
    id: "device-a::spotify",
    displayName: "Spotify",
    processName: "spotify.exe",
    executablePath: "C:\\Users\\me\\AppData\\Roaming\\Spotify\\Spotify.exe",
    processId: 700,
  });

  const edgeAssignment = assignmentFor(edge, "general", "edge");
  const spotifyAssignment = assignmentFor(spotify, "music", "spotify");

  const merged = upsertAssignmentLocally([edgeAssignment], spotifyAssignment);
  assert.equal(merged.length, 2);
  assert.equal(selectAssignmentForSession(merged, edge)?.channelId, "general");
  assert.equal(selectAssignmentForSession(merged, spotify)?.channelId, "music");
});
