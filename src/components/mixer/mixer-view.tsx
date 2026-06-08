import { Badge } from "@/components/ui/badge";
import { AudappChannelsStatus } from "@/components/audapp/audapp-channels-status";
import type { AudappChannelEndpoint } from "@/lib/audapp-endpoints";
import { groupSessionsIntoApps } from "@/lib/app-session-group";
import { statusBadgeVariant } from "@/lib/badge-variant";
import { type ResolvedInternalChannel } from "@/lib/channel-workflow";
import {
  summarizeRoutingMatch,
  summarizeSessionRoutingHonesty,
} from "@/lib/session-routing-honesty";
import { useAudioDsp } from "@/lib/use-audio-dsp";
import type { AudioChannel } from "@/types/audio";
import type { AudioDiscoveryDevice, AudioDiscoverySession } from "@/types/discovery";
import type { SessionRouteCapability, SessionRouteIntent } from "@/types/session-control";
import type { AudioSessionView } from "@/types/session-view";

import { VerticalChannelStrip } from "./vertical-channel-strip";

interface MixerViewProps {
  channels: AudioChannel[];
  sessions: AudioSessionView[];
  audappChannelEndpoints: AudappChannelEndpoint[];
  resolveChannelForSession: (session: AudioDiscoverySession) => ResolvedInternalChannel;
  routeIntentOptions: Array<{ value: SessionRouteIntent; label: string }>;
  routeCapability: SessionRouteCapability;
  outputDevices: AudioDiscoveryDevice[];
  soloedChannelIds: ReadonlySet<string>;
  mutedBySoloIds: ReadonlySet<string>;
  isSoloActive: boolean;
  onRouteIntentChange: (session: AudioSessionView, intent: SessionRouteIntent) => void;
  onVolumeChange: (id: string, value: number) => void;
  onVolumeCommit: (id: string, value: number) => void;
  onMuteToggle: (id: string, newMuted: boolean) => void;
  onSoloToggle: (id: string) => void;
  channelErrors: Record<string, string>;
  channelIsPending: (id: string) => boolean;
  settingsError?: string | null;
  settingsWarning?: string | null;
}

export function MixerView(props: MixerViewProps) {
  const dsp = useAudioDsp();

  const gainLabel =
    dsp.config.outputGainDb === 0
      ? "0 dB"
      : `${dsp.config.outputGainDb > 0 ? "+" : ""}${dsp.config.outputGainDb.toFixed(1)} dB`;

  // Compute apps per channel with warning detection.
  const appsByChannel: Record<string, Array<{ name: string; hasWarning: boolean }>> = {};
  for (const channel of props.channels) {
    const channelSessions = props.sessions.filter(
      (s) => props.resolveChannelForSession(s).channelId === channel.id,
    );
    const groups = groupSessionsIntoApps(channelSessions);
    appsByChannel[channel.id] = groups.map((group) => {
      const resolved = props.resolveChannelForSession(group.representative);
      const honesty = summarizeSessionRoutingHonesty(
        group.representative,
        resolved,
        props.outputDevices,
      );
      const match = summarizeRoutingMatch(resolved.channel.id, honesty);
      return {
        name: group.displayName,
        hasWarning: match.status === "warning",
      };
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Mixer</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Channel volumes and app routing.
        </p>
        {!props.routeCapability.perAppSwitchingSupported && (
          <p className="mt-1 text-xs text-muted-foreground">
            {props.routeCapability.statusReason}
          </p>
        )}
        {props.settingsWarning && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
            {props.settingsWarning}
          </p>
        )}
        {props.settingsError && (
          <p className="mt-1 text-xs text-destructive">{props.settingsError}</p>
        )}
      </div>

      <AudappChannelsStatus
        endpoints={props.audappChannelEndpoints}
        description="Each channel maps to a Windows AudappChannels endpoint when available."
      />

      {/* Channel strips — horizontal rows */}
      <div className="divide-y divide-border/50 rounded-xl bg-card">
        {props.channels.map((channel) => (
          <VerticalChannelStrip
            key={channel.id}
            channelId={channel.id}
            name={channel.name}
            volumePercent={channel.volume}
            muted={channel.muted}
            solo={props.soloedChannelIds.has(channel.id)}
            mutedBySolo={props.mutedBySoloIds.has(channel.id)}
            apps={appsByChannel[channel.id] ?? []}
            onVolumeChange={(value) => props.onVolumeChange(channel.id, value)}
            onVolumeCommit={(value) => props.onVolumeCommit(channel.id, value)}
            onMuteToggle={() => props.onMuteToggle(channel.id, !channel.muted)}
            onSoloToggle={() => props.onSoloToggle(channel.id)}
            error={props.channelErrors[channel.id] ?? null}
            isPending={props.channelIsPending(channel.id)}
          />
        ))}
      </div>

      {/* Solo status note */}
      {props.isSoloActive && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm">
          <p className="text-blue-700 dark:text-blue-300">
            Solo active — only soloed channels are audible. Click a solo button again to release.
          </p>
        </div>
      )}

      {/* Master DSP compact card */}
      <div className="rounded-xl bg-card px-4 py-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Master DSP</p>
            <Badge variant={statusBadgeVariant(dsp.config.enabled ? "info" : "neutral")}>
              {dsp.config.enabled ? "On" : "Pass-through"}
            </Badge>
            {dsp.config.enabled && dsp.config.eqEnabled && (
              <Badge variant={statusBadgeVariant("info")}>EQ</Badge>
            )}
          </div>
          <span className="font-mono text-xs text-muted-foreground">{gainLabel}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Applied to the mixed bridge output as final protection. Per-channel and master EQ
          live in the <strong className="text-foreground">Equalizer</strong> page.
        </p>
      </div>
    </div>
  );
}
