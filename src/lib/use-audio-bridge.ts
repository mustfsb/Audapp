import { useCallback, useEffect, useRef, useState } from "react";

import { invokeCommand } from "@/lib/tauri";
import type { BridgeCandidates, BridgePocConfig, BridgePocStatus } from "@/types/bridge";

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

const STOPPED_STATUS: BridgePocStatus = {
  running: false,
  state: "stopped",
  mode: "capture_only",
  audappRenderId: null,
  audappRenderName: null,
  audappCaptureId: null,
  monitorOutputId: null,
  monitorOutputName: null,
  inputFormat: null,
  outputFormat: null,
  resamplerActive: false,
  resamplerRatio: 1.0,
  pendingFrames: 0,
  droppedFrames: 0,
  captureDiscontinuityCount: 0,
  renderBufferFrames: 0,
  renderPaddingFrames: 0,
  bufferFillMs: 0,
  targetBufferMs: 50,
  primedFrames: 0,
  startedAt: null,
  renderLoopback: { ...EMPTY_STREAM },
  captureRead: { ...EMPTY_STREAM },
  monitorOutput: { active: false, initializeOk: false, startOk: false, framesWritten: 0, bytesWritten: 0, underruns: 0, lastError: null },
  lastError: null,
  updatedAt: new Date().toISOString(),
  dspEnabled: false,
  postDspPeak: 0,
  postDspRms: 0,
};

const EMPTY_CANDIDATES: BridgeCandidates = {
  audappRender: null,
  physicalOutputs: [],
  audappCapture: null,
};

const POLL_INTERVAL_MS = 2000;

export function useAudioBridge() {
  const [status, setStatus] = useState<BridgePocStatus>(STOPPED_STATUS);
  const [candidates, setCandidates] = useState<BridgeCandidates>(EMPTY_CANDIDATES);
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
      const s = await invokeCommand<BridgePocStatus>("get_audio_bridge_status");
      setStatus(s);
      if (s.state !== "running" && s.state !== "starting") {
        stopPolling();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [stopPolling]);

  const fetchCandidates = useCallback(async () => {
    setCandidatesLoading(true);
    try {
      const c = await invokeCommand<BridgeCandidates>("list_bridge_candidates");
      setCandidates(c);
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
    void fetchCandidates();
    return () => stopPolling();
  }, [fetchCandidates, stopPolling]);

  const start = useCallback(
    async (config: BridgePocConfig) => {
      setIsLoading(true);
      setError(null);
      try {
        const s = await invokeCommand<BridgePocStatus>("start_audio_bridge_poc", { config });
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
      const s = await invokeCommand<BridgePocStatus>("stop_audio_bridge_poc");
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [stopPolling]);

  return { status, candidates, isLoading, candidatesLoading, error, start, stop, refresh, fetchCandidates };
}
