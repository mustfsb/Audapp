import type { AudioDiscoverySession } from "../types/discovery.ts";
import type { ChannelAssignment, ChannelRule } from "../types/session-control.ts";

import {
  DEFAULT_INTERNAL_CHANNEL_ID,
  getInternalChannelById,
  isInternalChannelId,
  type InternalChannelDefinition,
  type InternalChannelId,
} from "./internal-channels.ts";
import {
  getChannelRuleMatchLabel,
  selectMatchingChannelRule,
} from "./channel-rules.ts";

export type SessionChannelSource = "manual" | "rule" | "smart_default" | "fallback";

export type ResolvedInternalChannel = {
  channelId: InternalChannelId;
  channel: InternalChannelDefinition;
  source: SessionChannelSource;
  assignment: ChannelAssignment | null;
  rule: ChannelRule | null;
};

const MUSIC_MATCHERS = ["spotify"];
// Browser / web-audio processes route to the Audapp Browser channel.
const BROWSER_MATCHERS = ["chrome", "msedge", "edge", "firefox", "brave", "opera", "vivaldi"];

function sessionIdentityParts(session: AudioDiscoverySession): string[] {
  return [session.displayName, session.processName, session.executablePath]
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.toLowerCase());
}

function includesAnyMatcher(parts: string[], matchers: string[]): boolean {
  return parts.some((part) => matchers.some((matcher) => part.includes(matcher)));
}

export function getSmartDefaultInternalChannelId(
  session: AudioDiscoverySession,
): InternalChannelId | null {
  const parts = sessionIdentityParts(session);
  if (parts.length === 0) {
    return null;
  }

  if (includesAnyMatcher(parts, MUSIC_MATCHERS)) {
    return "music";
  }

  if (includesAnyMatcher(parts, BROWSER_MATCHERS)) {
    return "browser";
  }

  // Voice/meeting apps (Discord, Teams, Zoom) intentionally fall through to the
  // General fallback — they are not forced onto an output channel in Phase 21H.
  return "general";
}

export function getSessionChannelSourceLabel(source: SessionChannelSource): string {
  switch (source) {
    case "manual":
      return "Manual";
    case "rule":
      return "Rule";
    case "smart_default":
      return "Smart default";
    case "fallback":
      return "Fallback";
    default:
      return source;
  }
}

export function resolveInternalChannelForSession(
  session: AudioDiscoverySession,
  assignment: ChannelAssignment | null,
  rules: ChannelRule[] = [],
): ResolvedInternalChannel {
  const assignedChannelId =
    assignment && isInternalChannelId(assignment.channelId) ? assignment.channelId : null;

  if (assignedChannelId) {
    return {
      channelId: assignedChannelId,
      channel: getInternalChannelById(assignedChannelId) ?? getDefaultInternalChannel(),
      source: "manual",
      assignment,
      rule: null,
    };
  }

  const matchedRule = selectMatchingChannelRule(rules, session);
  if (matchedRule && isInternalChannelId(matchedRule.channelId)) {
    return {
      channelId: matchedRule.channelId,
      channel: getInternalChannelById(matchedRule.channelId) ?? getDefaultInternalChannel(),
      source: "rule",
      assignment: null,
      rule: matchedRule,
    };
  }

  const smartDefaultId = getSmartDefaultInternalChannelId(session);
  if (smartDefaultId) {
    return {
      channelId: smartDefaultId,
      channel: getInternalChannelById(smartDefaultId) ?? getDefaultInternalChannel(),
      source: "smart_default",
      assignment: null,
      rule: null,
    };
  }

  return {
    channelId: DEFAULT_INTERNAL_CHANNEL_ID,
    channel: getDefaultInternalChannel(),
    source: "fallback",
    assignment: null,
    rule: null,
  };
}

function getDefaultInternalChannel(): InternalChannelDefinition {
  const channel = getInternalChannelById(DEFAULT_INTERNAL_CHANNEL_ID);
  if (!channel) {
    throw new Error("Default internal channel definition is missing.");
  }

  return channel;
}

export { getInternalChannelById };
export { getChannelRuleMatchLabel };
