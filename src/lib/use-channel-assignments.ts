import { useCallback, useEffect, useMemo, useState } from "react";

import { assignmentMatchFromSession } from "@/lib/session-target";
import { invokeCommand, isTauriRuntime } from "@/lib/tauri";
import type { AudioDiscoverySession } from "@/types/discovery";
import type {
  ChannelAssignment,
  RemoveChannelAssignmentInput,
  SetChannelAssignmentInput,
} from "@/types/session-control";

function assignmentMatchScore(
  assignment: ChannelAssignment,
  session: AudioDiscoverySession,
): number {
  const rule = assignment.match;

  if (
    rule.executablePath &&
    session.executablePath &&
    rule.executablePath.localeCompare(session.executablePath, undefined, {
      sensitivity: "accent",
    }) === 0
  ) {
    return 4;
  }

  if (
    rule.processName &&
    session.processName &&
    rule.processName.localeCompare(session.processName, undefined, {
      sensitivity: "accent",
    }) === 0
  ) {
    return 3;
  }

  if (
    rule.sessionDisplayName &&
    rule.sessionDisplayName.localeCompare(session.displayName, undefined, {
      sensitivity: "accent",
    }) === 0
  ) {
    return 2;
  }

  if (rule.processId !== undefined && rule.processId !== null && rule.processId === session.processId) {
    return 1;
  }

  return 0;
}

function selectAssignmentForSession(
  assignments: ChannelAssignment[],
  session: AudioDiscoverySession,
): ChannelAssignment | null {
  let best: ChannelAssignment | null = null;
  let bestScore = 0;

  for (const assignment of assignments) {
    const score = assignmentMatchScore(assignment, session);
    if (score > bestScore) {
      best = assignment;
      bestScore = score;
    }
  }

  return best;
}

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

      const input: SetChannelAssignmentInput = {
        channelId,
        match: assignmentMatchFromSession(session),
        label,
      };

      try {
        const saved = await invokeCommand<ChannelAssignment>(
          "set_channel_assignment",
          { input },
        );
        await refresh();
        setError(null);
        return saved;
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Failed to save channel assignment.";
        setError(message);
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
