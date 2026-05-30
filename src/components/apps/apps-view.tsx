import { useEffect, useState } from "react";
import { ArrowRightLeft, RefreshCw, Volume2, VolumeX } from "lucide-react";

import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  sessionProcessLabel,
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

  useEffect(() => {
    setDraftVolume(discoveredVolume);
  }, [discoveredVolume, session.id]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Session volume</span>
        <span className="font-medium">
          {draftVolume}%
          {session.muted ? " • muted" : ""}
          {isPending ? " • saving" : ""}
        </span>
      </div>
      <Slider
        value={[draftVolume]}
        min={0}
        max={100}
        step={1}
        disabled={disabled || isPending}
        onValueChange={(values) => setDraftVolume(values[0] ?? 0)}
        onValueCommit={(values) => onVolumeCommit(session, values[0] ?? 0)}
      />
    </div>
  );
}

export function AppsView({
  sessions,
  channels,
  outputDevices,
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
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Applications"
        title="Active session control"
        description="Adjust per-app Windows session volume and mute. Audapp local channel labels are metadata only and do not route audio yet."
        actions={
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh sessions
          </Button>
        }
      />

      {assignmentsError ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">{assignmentsError}</p>
      ) : null}

      {sessions.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No active sessions</CardTitle>
            <CardDescription>
              Start audio playback in an application, then refresh. System Sounds may appear when Windows plays UI audio.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {sessions.map((session) => {
            const channelId = channelIdForSession(session, defaultChannelId);
            const channel = channels.find((item) => item.id === channelId);
            const output = outputDevices.find((device) => device.id === session.deviceId);
            const controllable = isSessionControllable(session);
            const pending = isSessionPending(session);
            const inlineError = sessionError(session);
            const disabled = !controllable || pending || isAssignmentsLoading;

            return (
              <Card key={session.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>{sessionDisplayLabel(session)}</CardTitle>
                      <CardDescription>{sessionProcessLabel(session)}</CardDescription>
                    </div>
                    <Badge variant="outline">{session.state}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                    <SessionVolumeControl
                      session={session}
                      disabled={!controllable}
                      isPending={pending}
                      onVolumeCommit={onVolumeCommit}
                    />
                    <div className="flex min-w-48 flex-col gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Playback device</p>
                        <div className="mt-1 flex items-center gap-2 font-medium text-foreground">
                          <ArrowRightLeft className="size-4 text-muted-foreground" />
                          {output?.name ?? "Unknown endpoint"}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={disabled}
                        onClick={() => onMuteToggle(session, !session.muted)}
                      >
                        {session.muted ? (
                          <>
                            <VolumeX className="size-4" />
                            Unmute session
                          </>
                        ) : (
                          <>
                            <Volume2 className="size-4" />
                            Mute session
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {!controllable ? (
                    <p className="text-xs text-muted-foreground">
                      Controls are disabled for expired or unsupported sessions.
                    </p>
                  ) : null}

                  {inlineError ? (
                    <p className="text-sm text-amber-600 dark:text-amber-400">{inlineError}</p>
                  ) : null}

                  <div className="grid gap-2">
                    <p className="text-sm text-muted-foreground">Audapp local channel</p>
                    <Select
                      value={channelId}
                      disabled={isAssignmentsLoading || pending}
                      onValueChange={(value) => onChannelChange(session, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select channel" />
                      </SelectTrigger>
                      <SelectContent>
                        {channels.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Local grouping to {channel?.name ?? "no channel"}. This does not move or route Windows audio yet.
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
