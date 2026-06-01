import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { invokeCommand } from "@/lib/tauri";
import type { DspRuntimeConfig, DspRuntimeStatus } from "@/types/audio-engine";

const DEFAULT_DSP_CONFIG: DspRuntimeConfig = {
  enabled: false,
  outputGainDb: 0,
  inputGainDb: 0,
  highPassEnabled: false,
  highPassHz: 80,
  lowPassEnabled: false,
  lowPassHz: 18000,
  limiterEnabled: true,
  eqEnabled: false,
  eqPreset: "flat",
  eqBands: [
    { id: "band_100hz",   frequencyHz: 100,   gainDb: 0, enabled: true },
    { id: "band_250hz",   frequencyHz: 250,   gainDb: 0, enabled: true },
    { id: "band_1000hz",  frequencyHz: 1000,  gainDb: 0, enabled: true },
    { id: "band_4000hz",  frequencyHz: 4000,  gainDb: 0, enabled: true },
    { id: "band_10000hz", frequencyHz: 10000, gainDb: 0, enabled: true },
  ],
};

const THROTTLE_MS = 100;

type AudioDspValue = {
  config: DspRuntimeConfig;
  status: DspRuntimeStatus | null;
  isLoading: boolean;
  error: string | null;
  setConfig: (newConfig: DspRuntimeConfig) => void;
  commitConfig: (newConfig: DspRuntimeConfig) => Promise<void>;
  reset: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  setPreset: (preset: string) => Promise<void>;
};

const AudioDspContext = createContext<AudioDspValue | null>(null);

export function AudioDspProvider({ children }: { children: ReactNode }) {
  const value = useAudioDspState();
  return createElement(AudioDspContext.Provider, { value }, children);
}

export function useAudioDsp(): AudioDspValue {
  const ctx = useContext(AudioDspContext);
  if (!ctx) {
    throw new Error("useAudioDsp must be used within AudioDspProvider");
  }
  return ctx;
}

function useAudioDspState(): AudioDspValue {
  const [config, setConfigState] = useState<DspRuntimeConfig>(DEFAULT_DSP_CONFIG);
  const [status, setStatus] = useState<DspRuntimeStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void invokeCommand<DspRuntimeConfig>("get_dsp_config")
      .then(setConfigState)
      .catch(() => {});
    void invokeCommand<DspRuntimeStatus>("get_dsp_status")
      .then(setStatus)
      .catch(() => {});
  }, []);

  useEffect(() => {
    return () => {
      if (throttleRef.current !== null) clearTimeout(throttleRef.current);
    };
  }, []);

  const setConfig = useCallback((newConfig: DspRuntimeConfig) => {
    setConfigState(newConfig);
    if (throttleRef.current !== null) clearTimeout(throttleRef.current);
    throttleRef.current = setTimeout(() => {
      throttleRef.current = null;
      void invokeCommand<DspRuntimeStatus>("set_dsp_config", { config: newConfig })
        .then(setStatus)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    }, THROTTLE_MS);
  }, []);

  const commitConfig = useCallback(async (newConfig: DspRuntimeConfig) => {
    if (throttleRef.current !== null) {
      clearTimeout(throttleRef.current);
      throttleRef.current = null;
    }
    setConfigState(newConfig);
    setIsLoading(true);
    setError(null);
    try {
      const s = await invokeCommand<DspRuntimeStatus>("set_dsp_config", { config: newConfig });
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback(async () => {
    if (throttleRef.current !== null) {
      clearTimeout(throttleRef.current);
      throttleRef.current = null;
    }
    setIsLoading(true);
    setError(null);
    try {
      const cfg = await invokeCommand<DspRuntimeConfig>("reset_dsp_config");
      setConfigState(cfg);
      const s = await invokeCommand<DspRuntimeStatus>("get_dsp_status");
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await invokeCommand<DspRuntimeStatus>("get_dsp_status");
      setStatus(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const setPreset = useCallback(async (preset: string) => {
    if (throttleRef.current !== null) {
      clearTimeout(throttleRef.current);
      throttleRef.current = null;
    }
    setIsLoading(true);
    setError(null);
    try {
      const s = await invokeCommand<DspRuntimeStatus>("set_dsp_eq_preset", { preset });
      setStatus(s);
      const cfg = await invokeCommand<DspRuntimeConfig>("get_dsp_config");
      setConfigState(cfg);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    config,
    status,
    isLoading,
    error,
    setConfig,
    commitConfig,
    reset,
    refreshStatus,
    setPreset,
  };
}
