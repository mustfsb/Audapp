import { useCallback, useEffect, useMemo, useState } from "react";

import {
  dropAssignmentsForSession,
  selectAssignmentForSession,
  upsertAssignmentLocally,
} from "@/lib/channel-assignment-match";
import { assignmentMatchFromSession } from "@/lib/session-target";
import { invokeCommand, isTauriRuntime } from "@/lib/tauri";
import type { AudioDiscoverySession } from "@/types/discovery";
import type {
  ChannelAssignment,
  RemoveChannelAssignmentInput,
  SetChannelAssignmentInput,
} from "@/types/session-control";

export function useChannelAssignments() {
  const [assignments, setAssignments] = useState<ChannelAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isTauriRuntime()) {
      setAssignments([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const next = await invokeCommand<ChannelAssignment[]>("get_channel_assignments");
      setAssignments(next);
      setError(null);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to load channel assignments.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const channelIdForSession = useCallback(
    (session: AudioDiscoverySession, fallbackChannelId: string) => {
      const assignment = selectAssignmentForSession(assignments, session);
      return assignment?.channelId ?? fallbackChannelId;
    },
    [assignments],
  );

  const setAssignmentForSession = useCallback(
    async (session: AudioDiscoverySession, channelId: string, label: string) => {
      if (!isTauriRuntime()) {
        setError("Channel assignments require the Tauri desktop runtime.");
        return null;
      }

      const match = assignmentMatchFromSession(session);
      const input: SetChannelAssignmentInput = { channelId, match, label };

      // Optimistically reflect the manual override immediately so the Apps dropdown
      // updates and the requested channel wins over the rule/smart-default the moment
      // the user picks it — independent of the backend round-trip latency. Drop any
      // stale assignment for this app first so the new choice is the only match.
      const now = new Date().toISOString();
      const optimistic: ChannelAssignment = {
        id: `optimistic-${now}`,
        channelId,
        match,
        label,
        createdAt: now,
        updatedAt: now,
      };
      setAssignments((current) => [...dropAssignmentsForSession(current, session), optimistic]);

      try {
        const saved = await invokeCommand<ChannelAssignment>(
          "set_channel_assignment",
          { input },
        );
        // Reconcile the optimistic entry with the persisted one (real id/timestamps).
        setAssignments((current) => upsertAssignmentLocally(current, saved));
        setError(null);
        return saved;
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Failed to save channel assignment.";
        setError(message);
        // Roll back the optimistic change to the persisted truth.
        await refresh();
        return null;
      }
    },
    [refresh],
  );

  const removeAssignment = useCallback(async (assignmentId: string) => {
    if (!isTauriRuntime()) {
      return false;
    }

    try {
      const input: RemoveChannelAssignmentInput = { assignmentId };
      await invokeCommand<void>("remove_channel_assignment", { input });
      setAssignments((current) => current.filter((item) => item.id !== assignmentId));
      setError(null);
      return true;
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to remove channel assignment.";
      setError(message);
      return false;
    }
  }, []);

  const assignmentBySession = useMemo(
    () => (session: AudioDiscoverySession) => selectAssignmentForSession(assignments, session),
    [assignments],
  );

  return {
    assignments,
    isLoading,
    error,
    refresh,
    channelIdForSession,
    setAssignmentForSession,
    removeAssignment,
    assignmentBySession,
  };
}
