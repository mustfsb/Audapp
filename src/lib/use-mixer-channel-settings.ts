import { useCallback, useEffect, useMemo, useState } from "react";

import { invokeCommand, isTauriRuntime } from "@/lib/tauri";
import type { AudioChannel } from "@/types/audio";
import type {
  MixerChannelSetting,
  SetMixerChannelSettingInput,
} from "@/types/mixer-settings";

export function useMixerChannelSettings() {
  const [settings, setSettings] = useState<MixerChannelSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isTauriRuntime()) {
      setSettings([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const next = await invokeCommand<MixerChannelSetting[]>("get_mixer_channel_settings");
      setSettings(next);
      setError(null);
      setLoadWarning(null);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to load mixer channel settings.";
      setError(message);
      setSettings([]);
      setLoadWarning("Mixer settings could not be loaded; using defaults.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const settingsByChannelId = useMemo(() => {
    const map = new Map<string, MixerChannelSetting>();
    for (const entry of settings) {
      map.set(entry.channelId, entry);
    }
    return map;
  }, [settings]);

  const applyToChannels = useCallback(
    (channels: AudioChannel[]): AudioChannel[] =>
      channels.map((channel) => {
        const saved = settingsByChannelId.get(channel.id);
        if (!saved) {
          return channel;
        }

        return {
          ...channel,
          volume: saved.volumePercent,
          muted: saved.muted,
          peak: saved.muted ? 0 : Math.min(100, saved.volumePercent + 6),
          meterHold: saved.muted ? 0 : Math.min(100, saved.volumePercent + 12),
        };
      }),
    [settingsByChannelId],
  );

  const persistChannelSetting = useCallback(
    async (channelId: string, volumePercent: number, muted: boolean) => {
      if (!isTauriRuntime()) {
        return;
      }

      const input: SetMixerChannelSettingInput = {
        channelId,
        volumePercent,
        muted,
      };

      try {
        const saved = await invokeCommand<MixerChannelSetting>("set_mixer_channel_setting", {
          input,
        });
        setSettings((current) => {
          const without = current.filter((item) => item.channelId !== saved.channelId);
          return [...without, saved];
        });
        setError(null);
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Failed to save mixer channel settings.";
        setError(message);
      }
    },
    [],
  );

  const resetSettings = useCallback(async () => {
    if (!isTauriRuntime()) {
      setSettings([]);
      return;
    }

    try {
      await invokeCommand<void>("reset_mixer_channel_settings");
      setSettings([]);
      setError(null);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to reset mixer channel settings.";
      setError(message);
    }
  }, []);

  return {
    settings,
    settingsByChannelId,
    isLoading,
    error,
    loadWarning,
    refresh,
    applyToChannels,
    persistChannelSetting,
    resetSettings,
  };
}
