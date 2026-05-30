import { useCallback, useEffect, useRef, useState } from "react";

import { invokeCommand } from "@/lib/tauri";
import type {
  AudioEngineRuntimeStatus,
  DeviceFormatInfo,
  StartAudioEngineTestInput,
} from "@/types/audio-engine";

const STOPPED_STATUS: AudioEngineRuntimeStatus = {
  state: "stopped",
  mode: "none",
  inputDeviceId: null,
  outputDeviceId: null,
  sampleRate: null,
  channels: null,
  bitsPerSample: null,
  bufferFrames: null,
  estimatedLatencyMs: null,
  peakLevel: null,
  rmsLevel: null,
  glitchCount: 0,
  warning: null,
  lastError: null,
  updatedAt: new Date().toISOString(),
};

const POLL_INTERVAL_MS = 2000;

export function useAudioEngine() {
  const [status, setStatus] = useState<AudioEngineRuntimeStatus>(STOPPED_STATUS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceFormats, setDeviceFormats] = useState<DeviceFormatInfo[]>([]);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await invokeCommand<AudioEngineRuntimeStatus>(
        "get_audio_engine_runtime_status",
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
    void invokeCommand<DeviceFormatInfo[]>("get_audio_device_formats")
      .then(setDeviceFormats)
      .catch(() => setDeviceFormats([]));
  }, []);

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const start = useCallback(
    async (input: StartAudioEngineTestInput) => {
      setIsLoading(true);
      setError(null);
      try {
        const s = await invokeCommand<AudioEngineRuntimeStatus>(
          "start_audio_engine_test",
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
      const s = await invokeCommand<AudioEngineRuntimeStatus>(
        "stop_audio_engine_test",
      );
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
    deviceFormats,
    start,
    stop,
    refresh,
  };
}
