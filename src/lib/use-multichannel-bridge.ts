import { useCallback, useEffect, useRef, useState } from "react";

import { invokeCommand } from "@/lib/tauri";
import type {
  MultichannelBridgeCandidates,
  MultichannelBridgeStatus,
} from "@/types/bridge";

const EMPTY_STREAM = {
  active: false,
  initializeOk: false,
  startOk: false,
  packetsRead: 0,
  framesRead: 0,
  bytesRead: 0,
  silenceCount: 0,
  peak: 0,
  rms: 0,
  lastError: null,
};

const EMPTY_SOURCE_IDS = ["general", "music", "game", "browser"] as const;

const STOPPED_STATUS: MultichannelBridgeStatus = {
  running: false,
  state: "stopped",
  autoStarted: false,
  sources: EMPTY_SOURCE_IDS.map((channelId) => ({
    channelId,
    endpointId: null,
    endpointName: null,
    inputFormat: null,
    active: false,
    available: false,
    pendingFrames: 0,
    droppedFrames: 0,
    discontinuityCount: 0,
    resamplerActive: false,
    resamplerRatio: 1,
    gainPercent: 100,
    muted: false,
    stream: { ...EMPTY_STREAM },
  })),
  monitorOutput: {
    outputId: null,
    outputName: null,
    outputFormat: null,
    defaultRenderId: null,
    defaultRenderName: null,
    isPhysicalOutputAudapp: false,
    renderBufferFrames: 0,
    renderPaddingFrames: 0,
    bufferFillMs: 0,
    targetBufferMs: 50,
    primedFrames: 0,
    output: {
      active: false,
      initializeOk: false,
      startOk: false,
      framesWritten: 0,
      bytesWritten: 0,
      underruns: 0,
      lastError: null,
    },
  },
  startedAt: null,
  lastError: null,
  updatedAt: new Date().toISOString(),
  dspEnabled: false,
  postDspPeak: 0,
  postDspRms: 0,
};

const EMPTY_CANDIDATES: MultichannelBridgeCandidates = {
  channelOutputs: [],
  physicalOutputs: [],
  legacyInput: null,
};

const POLL_INTERVAL_MS = 2000;

export function useMultichannelBridge() {
  const [status, setStatus] = useState<MultichannelBridgeStatus>(STOPPED_STATUS);
  const [candidates, setCandidates] = useState<MultichannelBridgeCandidates>(EMPTY_CANDIDATES);
  const [isLoading, setIsLoading] = useState(false);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
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
      const next = await invokeCommand<MultichannelBridgeStatus>(
        "get_multichannel_bridge_status",
      );
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const fetchCandidates = useCallback(async () => {
    setCandidatesLoading(true);
    try {
      const next = await invokeCommand<MultichannelBridgeCandidates>(
        "list_multichannel_bridge_candidates",
      );
      setCandidates(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCandidatesLoading(false);
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollTimerRef.current = setInterval(() => void refresh(), POLL_INTERVAL_MS);
  }, [refresh, stopPolling]);

  useEffect(() => {
    void refresh();
    void fetchCandidates();
    startPolling();
    return () => stopPolling();
  }, [fetchCandidates, refresh, startPolling, stopPolling]);

  const start = useCallback(
    async (outputEndpointId?: string | null) => {
      setIsLoading(true);
      setError(null);
      try {
        const next = await invokeCommand<MultichannelBridgeStatus>(
          "start_multichannel_bridge",
          {
            input: {
              outputEndpointId: outputEndpointId ?? null,
              autoStarted: false,
            },
          },
        );
        setStatus(next);
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
    try {
      const next = await invokeCommand<MultichannelBridgeStatus>("stop_multichannel_bridge");
      setStatus(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    status,
    candidates,
    isLoading,
    candidatesLoading,
    error,
    start,
    stop,
    refresh,
    fetchCandidates,
  };
}
