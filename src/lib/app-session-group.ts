import type { AudioDiscoverySession } from "../types/discovery.ts";

/**
 * One user-facing application, aggregated from one or more Windows audio
 * sessions that share a stable app identity. The Apps page renders one card per
 * group instead of one card per raw session, so a browser with several audio
 * sessions (or duplicate PIDs) shows up exactly once.
 */
export type AppSessionGroup<T extends AudioDiscoverySession = AudioDiscoverySession> = {
  /** Stable identity key used to deduplicate sessions into this app. */
  key: string;
  /** User-facing app name (browsers are normalized to their product name). */
  displayName: string;
  /** Representative process name, or null when unknown. */
  processName: string | null;
  /** Number of underlying sessions folded into this app. */
  sessionCount: number;
  /** Every session that belongs to this app, in discovery order. */
  underlyingSessions: T[];
  /** Best session to use for channel resolution / route-intent display. */
  representative: T;
  /** True when at least one underlying session can be controlled. */
  anyControllable: boolean;
  /** True only when every controllable session is muted. */
  muted: boolean;
  /** Representative volume percent (0-100), or null when unknown. */
  volume: number | null;
};

/** Friendly product names for common browsers, keyed by normalized exe name. */
const BROWSER_DISPLAY_NAMES: Record<string, string> = {
  msedge: "Microsoft Edge",
  chrome: "Google Chrome",
  firefox: "Firefox",
  brave: "Brave",
  opera: "Opera",
  vivaldi: "Vivaldi",
};

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

/** Lowercased executable base name without the `.exe` suffix, or null. */
export function normalizeExecutableName(
  processName: string | null | undefined,
  executablePath?: string | null,
): string | null {
  const fromPath = executablePath
    ? executablePath.split(/[\\/]/).pop() ?? executablePath
    : null;
  const raw = firstNonEmpty(processName, fromPath);
  if (!raw) {
    return null;
  }
  return raw.toLowerCase().replace(/\.exe$/, "");
}

/** Normalized full executable path (lowercased), or null. */
function normalizeExecutablePath(executablePath: string | null | undefined): string | null {
  if (!executablePath || !executablePath.trim()) {
    return null;
  }
  return executablePath.trim().toLowerCase();
}

/**
 * Stable identity key for a session, by descending priority:
 * AppUserModelId, package family, package full name, normalized exe path,
 * normalized exe name, process id, then the raw session id as a last resort.
 */
export function appIdentityKey(session: AudioDiscoverySession): string {
  const aumid = firstNonEmpty(session.appUserModelId);
  if (aumid) {
    return `aumid:${aumid.toLowerCase()}`;
  }

  const family = firstNonEmpty(session.packageFamilyName);
  if (family) {
    return `pfn:${family.toLowerCase()}`;
  }

  const full = firstNonEmpty(session.packageFullName);
  if (full) {
    return `pkg:${full.toLowerCase()}`;
  }

  const exePath = normalizeExecutablePath(session.executablePath);
  if (exePath) {
    return `path:${exePath}`;
  }

  const exeName = normalizeExecutableName(session.processName, session.executablePath);
  if (exeName) {
    return `exe:${exeName}`;
  }

  if (session.processId !== null && session.processId !== undefined) {
    return `pid:${session.processId}`;
  }

  return `session:${session.id}`;
}

/** User-facing display name for an app group. Browsers map to product names. */
export function appGroupDisplayName(session: AudioDiscoverySession): string {
  const exeName = normalizeExecutableName(session.processName, session.executablePath);
  const browser = exeName ? BROWSER_DISPLAY_NAMES[exeName] : undefined;
  if (browser) {
    return browser;
  }

  if (session.isSystemSounds) {
    return "System Sounds";
  }

  return firstNonEmpty(session.displayName, session.processName) ?? "Unknown app";
}

function isControllable(session: AudioDiscoverySession): boolean {
  return session.state !== "expired" && Boolean(session.deviceId);
}

/**
 * Fold raw discovery sessions into one group per user-facing app identity.
 * Order is preserved by first-seen identity so the UI stays stable across
 * refreshes.
 */
export function groupSessionsIntoApps<T extends AudioDiscoverySession>(
  sessions: T[],
): Array<AppSessionGroup<T>> {
  const order: string[] = [];
  const buckets = new Map<string, T[]>();

  for (const session of sessions) {
    const key = appIdentityKey(session);
    const existing = buckets.get(key);
    if (existing) {
      existing.push(session);
    } else {
      buckets.set(key, [session]);
      order.push(key);
    }
  }

  return order.map((key) => {
    const groupSessions = buckets.get(key) ?? [];
    const representative =
      groupSessions.find((session) => isControllable(session)) ?? groupSessions[0];
    const controllable = groupSessions.filter((session) => isControllable(session));
    const anyControllable = controllable.length > 0;
    const muted =
      anyControllable && controllable.every((session) => session.muted === true);

    return {
      key,
      displayName: appGroupDisplayName(representative),
      processName: representative.processName,
      sessionCount: groupSessions.length,
      underlyingSessions: groupSessions,
      representative,
      anyControllable,
      muted,
      volume: representative.volume === null ? null : Math.round(representative.volume),
    } satisfies AppSessionGroup<T>;
  });
}
