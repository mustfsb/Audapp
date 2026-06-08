import { useCallback, useEffect, useRef, useState } from "react";

import { defaultChannelDspConfig } from "@/lib/channel-eq";
import { invokeCommand } from "@/lib/tauri";
import type { ChannelDspConfig, DspRuntimeConfig } from "@/types/audio-engine";

const THROTTLE_MS = 100;

export type ChannelDspValue = {
  channelId: string;
  config: DspRuntimeConfig;
  status: null;
  isLoading: boolean;
  error: string | null;
  setConfig: (config: DspRuntimeConfig) => void;
  commitConfig: (config: DspRuntimeConfig) => Promise<void>;
  setPreset: (preset: string) => Promise<void>;
  reset: () => Promise<void>;
};

function stripChannelId(config: ChannelDspConfig): DspRuntimeConfig {
  const { channelId: _channelId, ...rest } = config;
  return rest;
}

/**
 * Full per-channel DSP for the multichannel bridge. Each channel keeps an
 * independent enable/gain/EQ/filter config in the Rust backend; this hook reads
 * and writes that channel's slot. The returned shape is compatible with the
 * shared `DspControls` component.
 */
export function useChannelDsp(channelId: string): ChannelDspValue {
  const [config, setConfigState] = useState<DspRuntimeConfig>(defaultChannelDspConfig);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Cancel any pending write queued for the previous channel.
    if (throttleRef.current !== null) {
      clearTimeout(throttleRef.current);
      throttleRef.current = null;
    }
    setConfigState(defaultChannelDspConfig());
    void invokeCommand<ChannelDspConfig>("get_channel_dsp_config", { channelId })
      .then((loaded) => setConfigState(stripChannelId(loaded)))
      .catch(() => {});
  }, [channelId]);

  useEffect(() => {
    return () => {
      if (throttleRef.current !== null) clearTimeout(throttleRef.current);
    };
  }, []);

  const persist = useCallback(
    (next: DspRuntimeConfig) =>
      invokeCommand<ChannelDspConfig>("set_channel_dsp_config", {
        config: { ...next, channelId },
      }),
    [channelId],
  );

  const setConfig = useCallback(
    (next: DspRuntimeConfig) => {
      setConfigState(next);
      if (throttleRef.current !== null) clearTimeout(throttleRef.current);
      throttleRef.current = setTimeout(() => {
        throttleRef.current = null;
        void persist(next).catch((e: unknown) =>
          setError(e instanceof Error ? e.message : String(e)),
        );
      }, THROTTLE_MS);
    },
    [persist],
  );

  const commitConfig = useCallback(
    async (next: DspRuntimeConfig) => {
      if (throttleRef.current !== null) {
        clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }
      setConfigState(next);
      setIsLoading(true);
      setError(null);
      try {
        const saved = await persist(next);
        setConfigState(stripChannelId(saved));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsLoading(false);
      }
    },
    [persist],
  );

  const setPreset = useCallback(
    async (preset: string) => {
      if (throttleRef.current !== null) {
        clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }
      setIsLoading(true);
      setError(null);
      try {
        const saved = await invokeCommand<ChannelDspConfig>("set_channel_eq_preset", {
          channelId,
          preset,
        });
        setConfigState(stripChannelId(saved));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsLoading(false);
      }
    },
    [channelId],
  );

  const reset = useCallback(async () => {
    await commitConfig({ ...defaultChannelDspConfig(), enabled: config.enabled });
  }, [commitConfig, config.enabled]);

  return {
    channelId,
    config,
    status: null,
    isLoading,
    error,
    setConfig,
    commitConfig,
    setPreset,
    reset,
  };
}
