import { useCallback, useEffect, useMemo, useState } from "react";

import {
  sessionRouteIntentKeyFromDiscovery,
  sessionTargetFromDiscovery,
} from "@/lib/session-target";
import { invokeCommand, isTauriRuntime } from "@/lib/tauri";
import type { AudioDiscoverySession } from "@/types/discovery";
import type {
  ClearSessionRouteIntentInput,
  SessionRouteIntent,
  SessionRouteIntentEntry,
  SetSessionRouteIntentInput,
} from "@/types/session-control";
import type { AudioSessionView } from "@/types/session-view";

const DEFAULT_ROUTE_INTENT: SessionRouteIntent = "system";

function upsertEntry(
  current: SessionRouteIntentEntry[],
  next: SessionRouteIntentEntry,
): SessionRouteIntentEntry[] {
  if (next.intent === DEFAULT_ROUTE_INTENT) {
    return current.filter((entry) => entry.sessionKey !== next.sessionKey);
  }

  const index = current.findIndex((entry) => entry.sessionKey === next.sessionKey);
  if (index === -1) {
    return [...current, next];
  }

  const copy = [...current];
  copy[index] = next;
  return copy;
}

export function useSessionRouteIntents() {
  const [entries, setEntries] = useState<SessionRouteIntentEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isTauriRuntime()) {
      setEntries([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const next = await invokeCommand<SessionRouteIntentEntry[]>("get_session_route_intents");
      setEntries(next);
      setError(null);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to load session route intents.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const intentBySession = useCallback(
    (session: AudioDiscoverySession): SessionRouteIntent => {
      const key = sessionRouteIntentKeyFromDiscovery(session);
      if (!key) {
        return DEFAULT_ROUTE_INTENT;
      }

      return entries.find((entry) => entry.sessionKey === key)?.intent ?? DEFAULT_ROUTE_INTENT;
    },
    [entries],
  );

  const setIntentForSession = useCallback(
    async (session: AudioDiscoverySession, intent: SessionRouteIntent) => {
      const target = sessionTargetFromDiscovery(session);
      if (!target) {
        setError("This session cannot be targeted safely.");
        return null;
      }

      try {
        const input: SetSessionRouteIntentInput = { target, intent };
        const saved = await invokeCommand<SessionRouteIntentEntry>("set_session_route_intent", {
          input,
        });
        setEntries((current) => upsertEntry(current, saved));
        setError(null);
        return saved;
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Failed to save session route intent.";
        setError(message);
        return null;
      }
    },
    [],
  );

  const clearIntentForSession = useCallback(async (session: AudioDiscoverySession) => {
    const target = sessionTargetFromDiscovery(session);
    const key = sessionRouteIntentKeyFromDiscovery(session);

    if (!target || !key) {
      setError("This session cannot be targeted safely.");
      return false;
    }

    try {
      const input: ClearSessionRouteIntentInput = { target };
      await invokeCommand<void>("clear_session_route_intent", { input });
      setEntries((current) => current.filter((entry) => entry.sessionKey !== key));
      setError(null);
      return true;
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to clear session route intent.";
      setError(message);
      return false;
    }
  }, []);

  const mergeSessions = useMemo(
    () => (sessions: AudioDiscoverySession[]): AudioSessionView[] =>
      sessions.map((session) => ({
        ...session,
        routeIntent: intentBySession(session),
        routeIntentKey: sessionRouteIntentKeyFromDiscovery(session),
        routeStatus: null,
      })),
    [intentBySession],
  );

  return {
    entries,
    isLoading,
    error,
    refresh,
    intentBySession,
    setIntentForSession,
    clearIntentForSession,
    mergeSessions,
  };
}
