import { useCallback, useEffect, useState } from "react";

import { invokeCommand } from "@/lib/tauri";
import type { OutputPreferencesStatus } from "@/types/routing";

const EMPTY_STATUS: OutputPreferencesStatus = {
  primaryOutput: null,
  fallbackOutput: null,
  resolvedOutputId: null,
  resolvedOutputName: null,
  resolutionReason: null,
  resolutionMessage: null,
};

export function useOutputDevicePreferences() {
  const [status, setStatus] = useState<OutputPreferencesStatus>(EMPTY_STATUS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await invokeCommand<OutputPreferencesStatus>(
        "get_output_preferences_status_cmd",
      );
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setPreference = useCallback(
    async (slot: "primary" | "fallback", outputEndpointId: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const next = await invokeCommand<OutputPreferencesStatus>("set_output_preference_cmd", {
          slot,
          outputEndpointId,
        });
        setStatus(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const clearPreference = useCallback(async (slot: "primary" | "fallback") => {
    setIsLoading(true);
    setError(null);
    try {
      const next = await invokeCommand<OutputPreferencesStatus>("clear_output_preference_cmd", {
        slot,
      });
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    status,
    isLoading,
    error,
    refresh,
    setPreference,
    clearPreference,
  };
}
