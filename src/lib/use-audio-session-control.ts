import { useCallback, useRef, useState } from "react";

import { sessionControlKey, sessionTargetFromDiscovery } from "@/lib/session-target";
import { invokeCommand } from "@/lib/tauri";
import type { AudioDiscoverySession } from "@/types/discovery";
import type {
  AudioSessionControlResult,
  SetAudioSessionMuteInput,
  SetAudioSessionVolumeInput,
} from "@/types/session-control";

type ApplySnapshot = (snapshot: import("@/types/discovery").AudioDiscoverySnapshot) => void;

export function useAudioSessionControl(applySnapshot?: ApplySnapshot) {
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(() => new Set());
  const [errorsByKey, setErrorsByKey] = useState<Record<string, string>>({});
  const applySnapshotRef = useRef(applySnapshot);
  applySnapshotRef.current = applySnapshot;

  const setPending = useCallback((key: string, pending: boolean) => {
    setPendingKeys((current) => {
      const next = new Set(current);
      if (pending) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const reconcileResult = useCallback((session: AudioDiscoverySession, result: AudioSessionControlResult) => {
    const key = sessionControlKey(session);

    if (result.snapshot) {
      applySnapshotRef.current?.(result.snapshot);
    }

    if (!result.ok) {
      setErrorsByKey((current) => ({
        ...current,
        [key]: result.message ?? "Session control failed.",
      }));
      return;
    }

    setErrorsByKey((current) => {
      if (!(key in current)) {
        return current;
      }

      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const setVolume = useCallback(
    async (session: AudioDiscoverySession, volumePercent: number) => {
      const target = sessionTargetFromDiscovery(session);
      const key = sessionControlKey(session);

      if (!target) {
        setErrorsByKey((current) => ({
          ...current,
          [key]: "This session cannot be targeted safely.",
        }));
        return null;
      }

      setPending(key, true);

      try {
        const input: SetAudioSessionVolumeInput = { target, volumePercent };
        const result = await invokeCommand<AudioSessionControlResult>(
          "set_audio_session_volume",
          { input },
        );
        reconcileResult(session, result);
        return result;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Failed to set session volume.";
        setErrorsByKey((current) => ({ ...current, [key]: message }));
        return null;
      } finally {
        setPending(key, false);
      }
    },
    [reconcileResult, setPending],
  );

  const setMuted = useCallback(
    async (session: AudioDiscoverySession, muted: boolean) => {
      const target = sessionTargetFromDiscovery(session);
      const key = sessionControlKey(session);

      if (!target) {
        setErrorsByKey((current) => ({
          ...current,
          [key]: "This session cannot be targeted safely.",
        }));
        return null;
      }

      setPending(key, true);

      try {
        const input: SetAudioSessionMuteInput = { target, muted };
        const result = await invokeCommand<AudioSessionControlResult>(
          "set_audio_session_mute",
          { input },
        );
        reconcileResult(session, result);
        return result;
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Failed to set session mute.";
        setErrorsByKey((current) => ({ ...current, [key]: message }));
        return null;
      } finally {
        setPending(key, false);
      }
    },
    [reconcileResult, setPending],
  );

  const isPending = useCallback(
    (session: AudioDiscoverySession) => pendingKeys.has(sessionControlKey(session)),
    [pendingKeys],
  );

  const sessionError = useCallback(
    (session: AudioDiscoverySession) => errorsByKey[sessionControlKey(session)] ?? null,
    [errorsByKey],
  );

  return {
    setVolume,
    setMuted,
    isPending,
    sessionError,
  };
}
