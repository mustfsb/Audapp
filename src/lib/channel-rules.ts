import type { AudioDiscoverySession } from "../types/discovery.ts";
import type { ChannelRule, ChannelRuleMatchType } from "../types/session-control.ts";

import { isInternalChannelId, type InternalChannelId } from "./internal-channels.ts";

export const CHANNEL_RULES_STORAGE_KEY = "audapp.channelRules.v1";
export const CHANNEL_RULES_SEEDED_STORAGE_KEY = "audapp.channelRules.seeded.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function getChannelRuleMatchLabel(matchType: ChannelRuleMatchType): string {
  switch (matchType) {
    case "process_contains":
      return "process contains";
    case "process_equals":
      return "process equals";
    case "session_name_contains":
      return "session name contains";
    default:
      return matchType;
  }
}

export function createChannelRule(): ChannelRule {
  const timestamp = new Date().toISOString();
  return {
    id: `rule-${crypto.randomUUID()}`,
    enabled: true,
    matchType: "process_contains",
    pattern: "",
    channelId: "general",
    priority: 100,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function selectMatchingChannelRule(
  rules: ChannelRule[],
  session: AudioDiscoverySession,
): ChannelRule | null {
  const matches = rules
    .filter((rule) => isChannelRuleMatch(rule, session))
    .sort(compareChannelRules);

  return matches[0] ?? null;
}

export function readStoredChannelRules(storage: StorageLike): ChannelRule[] {
  ensureChannelRuleSeedMarker(storage);

  const raw = storage.getItem(CHANNEL_RULES_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isChannelRuleLike).map(normalizeChannelRule);
  } catch {
    return [];
  }
}

export function writeStoredChannelRules(storage: StorageLike, rules: ChannelRule[]): void {
  ensureChannelRuleSeedMarker(storage);
  storage.setItem(CHANNEL_RULES_STORAGE_KEY, JSON.stringify(rules));
}

function ensureChannelRuleSeedMarker(storage: StorageLike): void {
  if (storage.getItem(CHANNEL_RULES_SEEDED_STORAGE_KEY) === "true") {
    return;
  }

  storage.setItem(CHANNEL_RULES_SEEDED_STORAGE_KEY, "true");
  if (storage.getItem(CHANNEL_RULES_STORAGE_KEY) === null) {
    storage.setItem(CHANNEL_RULES_STORAGE_KEY, "[]");
  }
}

function isChannelRuleMatch(rule: ChannelRule, session: AudioDiscoverySession): boolean {
  if (!rule.enabled || !isInternalChannelId(rule.channelId)) {
    return false;
  }

  const pattern = normalizePattern(rule.pattern);
  if (!pattern) {
    return false;
  }

  switch (rule.matchType) {
    case "process_contains": {
      const processName = normalizePattern(session.processName);
      return Boolean(processName && processName.includes(pattern));
    }
    case "process_equals": {
      const processName = normalizePattern(session.processName);
      return Boolean(processName && processName === pattern);
    }
    case "session_name_contains": {
      const sessionName = normalizePattern(session.displayName);
      return Boolean(sessionName && sessionName.includes(pattern));
    }
    default:
      return false;
  }
}

function compareChannelRules(left: ChannelRule, right: ChannelRule): number {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }

  return left.createdAt.localeCompare(right.createdAt);
}

function normalizePattern(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function isChannelRuleLike(value: unknown): value is ChannelRule {
  if (!value || typeof value !== "object") {
    return false;
  }

  const rule = value as Partial<ChannelRule>;
  return (
    typeof rule.id === "string" &&
    typeof rule.enabled === "boolean" &&
    typeof rule.matchType === "string" &&
    typeof rule.pattern === "string" &&
    typeof rule.channelId === "string" &&
    typeof rule.priority === "number"
  );
}

function normalizeChannelRule(rule: ChannelRule): ChannelRule {
  const channelId: InternalChannelId = isInternalChannelId(rule.channelId)
    ? rule.channelId
    : "general";

  return {
    ...rule,
    pattern: rule.pattern,
    channelId,
    priority: Number.isFinite(rule.priority) ? rule.priority : 100,
  };
}
