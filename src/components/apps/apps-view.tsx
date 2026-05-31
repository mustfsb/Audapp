import { useEffect, useRef, useState } from "react";
import { RefreshCw, VolumeX, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  sessionDisplayLabel,
  sessionVolumePercent,
} from "@/lib/discovery-display";
import { isSessionControllable } from "@/lib/session-target";
import type { AudioChannel } from "@/types/audio";
import type { AudioDiscoveryDevice, AudioDiscoverySession } from "@/types/discovery";

interface AppsViewProps {
  sessions: AudioDiscoverySession[];
  channels: AudioChannel[];
  outputDevices: AudioDiscoveryDevice[];
  channelIdForSession: (session: AudioDiscoverySession, fallbackChannelId: string) => string;
  isLoading: boolean;
  isAssignmentsLoading: boolean;
  assignmentsError: string | null;
  isSessionPending: (session: AudioDiscoverySession) => boolean;
  sessionError: (session: AudioDiscoverySession) => string | null;
  onChannelChange: (session: AudioDiscoverySession, channelId: string) => void;
  onVolumeCommit: (session: AudioDiscoverySession, volumePercent: number) => void;
  onMuteToggle: (session: AudioDiscoverySession, muted: boolean) => void;
  onRefresh: () => void;
}

const LIVE_VOLUME_THROTTLE_MS = 100;

function SessionVolumeControl({
  session,
  disabled,
  isPending,
  onVolumeCommit,
}: {
  session: AudioDiscoverySession;
  disabled: boolean;
  isPending: boolean;
  onVolumeCommit: (session: AudioDiscoverySession, volumePercent: number) => void;
}) {
  const discoveredVolume = sessionVolumePercent(session) ?? 0;
  const [draftVolume, setDraftVolume] = useState(discoveredVolume);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraftVolume(discoveredVolume);
  }, [discoveredVolume, session.id]);

  useEffect(() => {
    return () => {
      if (liveTimerRef.current !== null) clearTimeout(liveTimerRef.current);
    };
  }, []);

  function handleValueChange(values: number[]) {
    const v = values[0] ?? draftVolume;
    setDraftVolume(v);
    if (liveTimerRef.current !== null) clearTimeout(liveTimerRef.current);
    liveTimerRef.current = setTimeout(() => {
      liveTimerRef.current = null;
      onVolumeCommit(session, v);
    }, LIVE_VOLUME_THROTTLE_MS);
  }

  function handleValueCommit(values: number[]) {
    const v = values[0] ?? draftVolume;
    if (liveTimerRef.current !== null) {
      clearTimeout(liveTimerRef.current);
      liveTimerRef.current = null;
    }
    onVolumeCommit(session, v);
  }

  return (
    <div className="flex items-center gap-3">
      <Slider
        value={[draftVolume]}
        min={0} max={100} step={1}
        disabled={disabled}
        onValueChange={handleValueChange}
        onValueCommit={handleValueCommit}
        className="flex-1"
      />
      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
        {draftVolume}%{isPending ? "…" : ""}
      </span>
    </div>
  );
}

export function AppsView({
  sessions,
  channels,
  channelIdForSession,
  isLoading,
  isAssignmentsLoading,
  assignmentsError,
  isSessionPending,
  sessionError,
  onChannelChange,
  onVolumeCommit,
  onMuteToggle,
  onRefresh,
}: AppsViewProps) {
  const defaultChannelId = channels[0]?.id ?? "";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Apps</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Per-app Windows session volume and mute. Channel assignment is local grouping only.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {assignmentsError && (
        <p className="text-sm text-amber-600 dark:text-amber-400">{assignmentsError}</p>
      )}

      {sessions.length === 0 ? (
        <div className="rounded-md border border-border px-4 py-8 text-center">
          <p className="text-sm font-medium text-muted-foreground">No active sessions</p>
          <p className="mt-1 text-xs text-muted-foreground">Start audio playback in an application, then refresh.</p>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {sessions.map((session) => {
            const channelId = channelIdForSession(session, defaultChannelId);
            const controllable = isSessionControllable(session);
            const pending = isSessionPending(session);
            const inlineError = sessionError(session);
            const disabled = !controllable || pending || isAssignmentsLoading;

            return (
              <Card key={session.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-semibold leading-tight">
                      {sessionDisplayLabel(session)}
                    </CardTitle>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {session.muted && (
                        <span className="text-xs text-muted-foreground">Muted</span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={disabled}
                        onClick={() => onMuteToggle(session, !session.muted)}
                        title={session.muted ? "Unmute" : "Mute"}
                      >
                        {session.muted
                          ? <VolumeX className="size-3.5 text-muted-foreground" />
                          : <Volume2 className="size-3.5 text-muted-foreground" />
                        }
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <SessionVolumeControl
                    session={session}
                    disabled={!controllable}
                    isPending={pending}
                    onVolumeCommit={onVolumeCommit}
                  />

                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs text-muted-foreground">Channel</span>
                    <Select
                      value={channelId}
                      disabled={isAssignmentsLoading || pending}
                      onValueChange={(value) => onChannelChange(session, value)}
                    >
                      <SelectTrigger className="h-7 flex-1 text-xs">
                        <SelectValue placeholder="Assign" />
                      </SelectTrigger>
                      <SelectContent>
                        {channels.map((item) => (
                          <SelectItem key={item.id} value={item.id} className="text-xs">
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {!controllable && (
                    <p className="text-xs text-muted-foreground">Controls unavailable for this session.</p>
                  )}
                  {inlineError && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">{inlineError}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
