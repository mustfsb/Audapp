import { useCallback, useState } from "react";

import {
  createChannelRule,
  readStoredChannelRules,
  writeStoredChannelRules,
} from "@/lib/channel-rules";
import type { ChannelRule } from "@/types/session-control";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function useChannelRules() {
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<ChannelRule[]>(() => {
    if (!canUseStorage()) {
      return [];
    }

    try {
      return readStoredChannelRules(window.localStorage);
    } catch {
      return [];
    }
  });

  const mutateRules = useCallback((updater: (current: ChannelRule[]) => ChannelRule[]) => {
    setRules((current) => {
      const next = updater(current);

      if (!canUseStorage()) {
        return next;
      }

      try {
        writeStoredChannelRules(window.localStorage, next);
        setError(null);
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Failed to save channel rules.";
        setError(message);
      }

      return next;
    });
  }, []);

  const addRule = useCallback(() => {
    mutateRules((current) => [...current, createChannelRule()]);
  }, [mutateRules]);

  const updateRule = useCallback(
    (ruleId: string, patch: Partial<ChannelRule>) => {
      mutateRules((current) =>
        current.map((rule) =>
          rule.id === ruleId
            ? {
                ...rule,
                ...patch,
                updatedAt: new Date().toISOString(),
              }
            : rule,
        ),
      );
    },
    [mutateRules],
  );

  const removeRule = useCallback(
    (ruleId: string) => {
      mutateRules((current) => current.filter((rule) => rule.id !== ruleId));
    },
    [mutateRules],
  );

  return {
    rules,
    error,
    addRule,
    updateRule,
    removeRule,
  };
}
