import { Badge } from "@/components/ui/badge";
import { AudappChannelsStatus } from "@/components/audapp/audapp-channels-status";
import type { AudappChannelEndpoint } from "@/lib/audapp-endpoints";
import { groupSessionsIntoApps } from "@/lib/app-session-group";
import { statusBadgeVariant } from "@/lib/badge-variant";
import {
  getChannelRuleMatchLabel,
  getSessionChannelSourceLabel,
  type ResolvedInternalChannel,
} from "@/lib/channel-workflow";
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
  assignmentCountsByChannel: Record<string, number>;
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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Mixer</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Internal Audapp channel groups. Requested channel grouping is separate from
          the Windows endpoint each app is actually using.
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
        description="Each channel maps to a Windows AudappChannels endpoint when available. Internal assignment alone does not move apps between those Windows endpoints."
      />

      {/* Channel strips */}
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-min items-stretch justify-start gap-3">
          {props.channels.map((channel) => (
            <VerticalChannelStrip
              key={channel.id}
              channelId={channel.id}
              name={channel.name}
              volumePercent={channel.volume}
              muted={channel.muted}
              solo={props.soloedChannelIds.has(channel.id)}
              mutedBySolo={props.mutedBySoloIds.has(channel.id)}
              activeSessionCount={props.assignmentCountsByChannel[channel.id] ?? 0}
              onVolumeChange={(value) => props.onVolumeChange(channel.id, value)}
              onVolumeCommit={(value) => props.onVolumeCommit(channel.id, value)}
              onMuteToggle={() => props.onMuteToggle(channel.id, !channel.muted)}
              onSoloToggle={() => props.onSoloToggle(channel.id)}
              error={props.channelErrors[channel.id] ?? null}
              isPending={props.channelIsPending(channel.id)}
            />
          ))}
        </div>
      </div>

      {/* Solo status note */}
      {props.isSoloActive && (
        <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm">
          <p className="text-blue-700 dark:text-blue-300">
            Solo active — only soloed channels are audible. Other channel sessions are muted.
            Click a solo button again to release.
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Channel controls use Windows session volume/mute. Master DSP applies to the full
            mixed bridge output.
          </p>
        </div>
      )}

      {/* Master DSP compact card */}
      <div className="rounded-xl border border-border/60 bg-card px-4 py-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">Master DSP</p>
            <span
              className={
                dsp.config.enabled
                  ? "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-blue-500/20 text-blue-600 dark:text-blue-400"
                  : "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground"
              }
            >
              {dsp.config.enabled ? "On" : "Pass-through"}
            </span>
            {dsp.config.enabled && dsp.config.eqEnabled && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-purple-500/20 text-purple-600 dark:text-purple-400">
                EQ
              </span>
            )}
          </div>
          <span className="font-mono text-xs text-muted-foreground">{gainLabel}</span>
        </div>

        <p className="text-xs text-muted-foreground">
          Applied to the mixed Audapp bridge output. Configure gain and EQ in the{" "}
          <strong className="text-foreground">Equalizer</strong> page.
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          Per-channel EQ requires separated streams — coming in a future phase.
        </p>
      </div>

      {/* App cards per channel */}
      <div className="grid gap-3 lg:grid-cols-2">
        {props.channels.map((channel) => {
          const channelSessions = props.sessions.filter(
            (session) => props.resolveChannelForSession(session).channelId === channel.id,
          );
          const appGroups = groupSessionsIntoApps(channelSessions);

          return (
            <div key={`${channel.id}-sessions`} className="rounded-2xl bg-card px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{channel.name}</p>
                  {props.soloedChannelIds.has(channel.id) && (
                    <Badge variant={statusBadgeVariant("info")}>Solo</Badge>
                  )}
                  {props.mutedBySoloIds.has(channel.id) && (
                    <Badge variant={statusBadgeVariant("warning")}>Muted by solo</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {appGroups.length === 0
                    ? "No apps"
                    : `${appGroups.length} app${appGroups.length !== 1 ? "s" : ""}`}
                </p>
              </div>

              <div className="mt-3 space-y-2">
                {appGroups.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No apps grouped here yet.</p>
                ) : (
                  appGroups.map((group) => {
                    const representative = group.representative;
                    const resolvedChannel = props.resolveChannelForSession(representative);
                    const routingHonesty = summarizeSessionRoutingHonesty(
                      representative,
                      resolvedChannel,
                      props.outputDevices,
                    );
                    const match = summarizeRoutingMatch(
                      resolvedChannel.channel.id,
                      routingHonesty,
                    );

                    return (
                      <div
                        key={`${channel.id}-${group.key}`}
                        className="rounded-xl border border-border/50 px-3 py-2"
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-xs font-medium">{group.displayName}</p>
                              {group.sessionCount > 1 && (
                                <Badge variant="secondary">{group.sessionCount}</Badge>
                              )}
                            </div>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {getSessionChannelSourceLabel(resolvedChannel.source)}
                              {resolvedChannel.rule
                                ? ` · ${getChannelRuleMatchLabel(
                                    resolvedChannel.rule.matchType,
                                  )} "${resolvedChannel.rule.pattern}"`
                                : ""}
                            </p>
                          </div>
                          <Badge variant={statusBadgeVariant(match.status)} className="shrink-0">
                            {match.statusLabel}
                          </Badge>
                        </div>
                        <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                          Actual: {routingHonesty.actualEndpointLabel}
                        </p>
                        {match.helperText && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400">
                            {match.helperText}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
