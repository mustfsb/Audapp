import { useCallback, useEffect, useRef, useState } from "react";

import { invokeCommand } from "@/lib/tauri";
import type { RoutingStatus } from "@/types/routing";

const STOPPED: RoutingStatus = {
  routingEnabled: false,
  currentDefaultRenderId: null,
  currentDefaultRenderName: null,
  previousDefaultRenderId: null,
  previousDefaultRenderName: null,
  audappDefaultRenderId: null,
  audappDefaultRenderName: null,
  selectedOutputId: null,
  selectedOutputName: null,
  bridgeRunning: false,
  bridgeState: "stopped",
  autoStarted: false,
  restoreAvailable: false,
  lastError: null,
};

const POLL_MS = 3000;

export function useRouting() {
  const [status, setStatus] = useState<RoutingStatus>(STOPPED);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await invokeCommand<RoutingStatus>("routing_get_status_cmd");
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const startPoll = useCallback(() => {
    if (pollRef.current !== null) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => void refresh(), POLL_MS);
  }, [refresh]);

  const stopPoll = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    void refresh();
    startPoll();
    return () => stopPoll();
  }, [refresh, startPoll, stopPoll]);

  const enable = useCallback(async (outputEndpointId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const s = await invokeCommand<RoutingStatus>("routing_enable_system", {
        outputEndpointId,
      });
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const s = await invokeCommand<RoutingStatus>("routing_disable_system");
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { status, isLoading, error, enable, disable, refresh };
}
