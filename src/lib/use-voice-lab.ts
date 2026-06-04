import { useCallback, useEffect, useRef, useState } from "react";

import { invokeCommand } from "@/lib/tauri";
import type {
  VoiceDevice,
  VoiceLabSettings,
  VoiceLabStatus,
} from "@/types/voice-lab";
import { DEFAULT_VOICE_SETTINGS, STOPPED_VOICE_STATUS } from "@/types/voice-lab";

const SETTINGS_KEY = "audapp.voiceLab.settings.v1";
const POLL_MS = 300;

function loadPersistedSettings(): VoiceLabSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_VOICE_SETTINGS;
    return { ...DEFAULT_VOICE_SETTINGS, ...(JSON.parse(raw) as Partial<VoiceLabSettings>) };
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

function savePersistedSettings(s: VoiceLabSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // Storage may be unavailable in some environments
  }
}

export function useVoiceLab() {
  const [status, setStatus] = useState<VoiceLabStatus>(STOPPED_VOICE_STATUS);
  const [inputDevices, setInputDevices] = useState<VoiceDevice[]>([]);
  const [outputDevices, setOutputDevices] = useState<VoiceDevice[]>([]);
  const [settings, setSettingsState] = useState<VoiceLabSettings>(loadPersistedSettings);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await invokeCommand<VoiceLabStatus>("voice_get_status");
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
    pollRef.current = setInterval(() => void refresh(), POLL_MS);
  }, [refresh, stopPolling]);

  const loadDevices = useCallback(async () => {
    try {
      const [inputs, outputs] = await Promise.all([
        invokeCommand<VoiceDevice[]>("voice_list_input_devices").catch(() => []),
        invokeCommand<VoiceDevice[]>("voice_list_monitor_outputs").catch(() => []),
      ]);
      setInputDevices(inputs);
      setOutputDevices(outputs);
    } catch {
      // Non-fatal — devices will stay empty
    }
  }, []);

  useEffect(() => {
    void loadDevices();
    return () => stopPolling();
  }, [loadDevices, stopPolling]);

  const setSettings = useCallback(
    async (next: VoiceLabSettings) => {
      setSettingsState(next);
      savePersistedSettings(next);
      // If running, push settings update to worker
      if (status.running) {
        try {
          const s = await invokeCommand<VoiceLabStatus>("voice_update_settings", { settings: next });
          setStatus(s);
        } catch {
          // Non-fatal — worker will pick up settings on next poll cycle
        }
      }
    },
    [status.running],
  );

  const start = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const s = await invokeCommand<VoiceLabStatus>("voice_start_lab", { settings });
      setStatus(s);
      startPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [settings, startPolling]);

  const stop = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    stopPolling();
    try {
      const s = await invokeCommand<VoiceLabStatus>("voice_stop_lab");
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [stopPolling]);

  return {
    status,
    inputDevices,
    outputDevices,
    settings,
    setSettings,
    isLoading,
    error,
    start,
    stop,
    refresh: () => void refresh(),
    reloadDevices: () => void loadDevices(),
  };
}
