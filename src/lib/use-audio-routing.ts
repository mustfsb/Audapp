import { useCallback, useEffect, useRef, useState } from "react";

import { invokeCommand } from "@/lib/tauri";
import type {
  AudioRoutingRuntimeStatus,
  RoutingConfigInput,
} from "@/types/routing";

const STOPPED_STATUS: AudioRoutingRuntimeStatus = {
  state: "stopped",
  captureDeviceId: null,
  renderDeviceId: null,
  sampleRate: null,
  inputChannels: null,
  outputChannels: null,
  bufferFrames: null,
  estimatedLatencyMs: null,
  ringFillPercent: null,
  underrunCount: 0,
  overrunCount: 0,
  glitchCount: 0,
  peakLevel: null,
  rmsLevel: null,
  warning: null,
  lastError: null,
  updatedAt: new Date().toISOString(),
};

const POLL_INTERVAL_MS = 2000;

export function useAudioRouting() {
  const [status, setStatus] = useState<AudioRoutingRuntimeStatus>(STOPPED_STATUS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await invokeCommand<AudioRoutingRuntimeStatus>(
        "get_audio_routing_status",
      );
      setStatus(s);
      if (s.state !== "running" && s.state !== "starting") {
        stopPolling();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollTimerRef.current = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
  }, [refresh, stopPolling]);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const start = useCallback(
    async (input: RoutingConfigInput) => {
      setIsLoading(true);
      setError(null);
      try {
        const s = await invokeCommand<AudioRoutingRuntimeStatus>(
          "start_audio_routing",
          { input },
        );
        setStatus(s);
        startPolling();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    },
    [startPolling],
  );

  const stop = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    stopPolling();
    try {
      const s = await invokeCommand<AudioRoutingRuntimeStatus>("stop_audio_routing");
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [stopPolling]);

  return {
    status,
    isLoading,
    error,
    start,
    stop,
    refresh,
  };
}
