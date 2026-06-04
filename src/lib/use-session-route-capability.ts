import { useCallback, useEffect, useState } from "react";

import { invokeCommand, isTauriRuntime } from "@/lib/tauri";
import type { SessionRouteCapability } from "@/types/session-control";

const FALLBACK_CAPABILITY: SessionRouteCapability = {
  perAppSwitchingSupported: false,
  supportScope: "unsupported",
  statusReason:
    "Windows per-app output switching is not available through the current safe API path yet.",
  manualFallback: "Windows Settings -> Sound -> Volume mixer -> choose app output device",
  inspectedStorage:
    "HKCU\\Software\\Microsoft\\Internet Explorer\\LowRegistry\\Audio\\PolicyConfig\\PropertyStore",
};

export function useSessionRouteCapability() {
  const [capability, setCapability] = useState<SessionRouteCapability>(FALLBACK_CAPABILITY);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isTauriRuntime()) {
      setCapability(FALLBACK_CAPABILITY);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const next = await invokeCommand<SessionRouteCapability>("get_session_route_capability");
      setCapability(next);
      setError(null);
    } catch (cause) {
      setCapability(FALLBACK_CAPABILITY);
      setError(
        cause instanceof Error ? cause.message : "Failed to load session route capability.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    capability,
    isLoading,
    error,
    refresh,
  };
}
