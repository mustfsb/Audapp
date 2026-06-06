import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, RefreshCw, RotateCcw, Trash2, Volume2, VolumeX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  groupSessionsIntoApps,
  type AppSessionGroup,
} from "@/lib/app-session-group";
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
import type { AudioChannel } from "@/types/audio";
import type { AudioDiscoveryDevice, AudioDiscoverySession } from "@/types/discovery";
import type {
  ChannelRule,
  SessionRouteCapability,
  SessionRouteIntent,
} from "@/types/session-control";
import type { AudioSessionView } from "@/types/session-view";

interface AppsViewProps {
  sessions: AudioSessionView[];
  channels: AudioChannel[];
  outputDevices: AudioDiscoveryDevice[];
  resolveChannelForSession: (session: AudioDiscoverySession) => ResolvedInternalChannel;
  isLoading: boolean;
  isAssignmentsLoading: boolean;
  assignmentsError: string | null;
  channelRules: ChannelRule[];
  routeCapability: SessionRouteCapability;
  isSessionPending: (session: AudioDiscoverySession) => boolean;
  sessionError: (session: AudioDiscoverySession) => string | null;
  routeIntentOptions: Array<{ value: SessionRouteIntent; label: string }>;
  onRouteIntentChange: (session: AudioSessionView, intent: SessionRouteIntent) => void;
  onChannelChange: (session: AudioSessionView, channelId: string) => void;
  onResetManualAssignment: (session: AudioSessionView) => void;
  onAddChannelRule: () => void;
  onUpdateChannelRule: (ruleId: string, patch: Partial<ChannelRule>) => void;
  onDeleteChannelRule: (ruleId: string) => void;
  onVolumeCommit: (session: AudioSessionView, volumePercent: number) => void;
  onMuteToggle: (session: AudioSessionView, muted: boolean) => void;
  onRefresh: () => void;
}

const LIVE_VOLUME_THROTTLE_MS = 100;

function VolumeControl({
  value,
  disabled,
  isPending,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  isPending: boolean;
  onCommit: (volumePercent: number) => void;
}) {
  const [draftVolume, setDraftVolume] = useState(value);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraftVolume(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (liveTimerRef.current !== null) {
        clearTimeout(liveTimerRef.current);
      }
    };
  }, []);

  function handleValueChange(values: number[]) {
    const next = values[0] ?? draftVolume;
    setDraftVolume(next);
    if (liveTimerRef.current !== null) {
      clearTimeout(liveTimerRef.current);
    }
    liveTimerRef.current = setTimeout(() => {
      liveTimerRef.current = null;
      onCommit(next);
    }, LIVE_VOLUME_THROTTLE_MS);
  }

  function handleValueCommit(values: number[]) {
    const next = values[0] ?? draftVolume;
    if (liveTimerRef.current !== null) {
      clearTimeout(liveTimerRef.current);
      liveTimerRef.current = null;
    }
    onCommit(next);
  }

  return (
    <div className="flex items-center gap-3">
      <Slider
        value={[draftVolume]}
        min={0}
        max={100}
        step={1}
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
  outputDevices,
  resolveChannelForSession,
  isLoading,
  isAssignmentsLoading,
  assignmentsError,
  channelRules,
  routeCapability,
  isSessionPending,
  sessionError,
  routeIntentOptions,
  onRouteIntentChange,
  onChannelChange,
  onResetManualAssignment,
  onAddChannelRule,
  onUpdateChannelRule,
  onDeleteChannelRule,
  onVolumeCommit,
  onMuteToggle,
  onRefresh,
}: AppsViewProps) {
  const appGroups = groupSessionsIntoApps(sessions);

  function controllableSessions(group: AppSessionGroup<AudioSessionView>) {
    return group.underlyingSessions.filter(
      (session) => session.state !== "expired" && Boolean(session.deviceId),
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Apps</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Group each app into an Audapp channel. The actual Windows output can differ
            until you change it in Volume Mixer.
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

      {appGroups.length === 0 ? (
        <div className="rounded-2xl bg-card px-4 py-10 text-center">
          <p className="text-sm font-medium text-muted-foreground">No active apps</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Start audio playback in an application, then refresh.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {appGroups.map((group) => {
            const representative = group.representative;
            const resolvedChannel = resolveChannelForSession(representative);
            const routingHonesty = summarizeSessionRoutingHonesty(
              representative,
              resolvedChannel,
              outputDevices,
            );
            const match = summarizeRoutingMatch(resolvedChannel.channel.id, routingHonesty);
            const pending = group.underlyingSessions.some((session) =>
              isSessionPending(session),
            );
            const inlineError =
              group.underlyingSessions.map((session) => sessionError(session)).find(Boolean) ??
              null;
            const controllable = group.anyControllable;
            const channelDisabled = isAssignmentsLoading || pending;

            const applyMute = (muted: boolean) => {
              for (const session of controllableSessions(group)) {
                onMuteToggle(session, muted);
              }
            };
            const applyVolume = (volumePercent: number) => {
              for (const session of controllableSessions(group)) {
                onVolumeCommit(session, volumePercent);
              }
            };
            const applyRouteIntent = (intent: SessionRouteIntent) => {
              for (const session of group.underlyingSessions) {
                if (session.routeIntentKey) {
                  onRouteIntentChange(session, intent);
                }
              }
            };

            return (
              <div key={group.key} className="space-y-3 rounded-2xl bg-card px-4 py-3.5">
                {/* Identity + mute */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium leading-tight">
                        {group.displayName}
                      </p>
                      {group.sessionCount > 1 && (
                        <Badge variant="secondary">{group.sessionCount} sessions</Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {group.processName ?? "Unknown process"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 text-muted-foreground"
                    disabled={!controllable || pending}
                    onClick={() => applyMute(!group.muted)}
                    title={group.muted ? "Unmute" : "Mute"}
                  >
                    {group.muted ? (
                      <VolumeX className="size-3.5" />
                    ) : (
                      <Volume2 className="size-3.5" />
                    )}
                  </Button>
                </div>

                <VolumeControl
                  value={group.volume ?? 0}
                  disabled={!controllable}
                  isPending={pending}
                  onCommit={applyVolume}
                />

                {/* Channel assignment */}
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs text-muted-foreground">Channel</span>
                  <Select
                    value={resolvedChannel.channelId}
                    disabled={channelDisabled}
                    onValueChange={(value) => onChannelChange(representative, value)}
                  >
                    <SelectTrigger size="sm" className="flex-1 text-xs">
                      <SelectValue placeholder="Assign" />
                    </SelectTrigger>
                    <SelectContent>
                      {channels.map((channel) => (
                        <SelectItem key={channel.id} value={channel.id} className="text-xs">
                          {channel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {resolvedChannel.assignment && (
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={channelDisabled}
                      onClick={() => onResetManualAssignment(representative)}
                      title="Reset to smart default"
                    >
                      <RotateCcw className="size-3" />
                      Reset
                    </Button>
                  )}
                </div>

                {/* Requested vs actual endpoint */}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 text-[11px] leading-relaxed text-muted-foreground">
                    <p className="truncate">
                      Requested:{" "}
                      <span className="font-medium text-foreground">
                        {routingHonesty.requestedChannelLabel}
                      </span>{" "}
                      <span className="text-muted-foreground/70">
                        ({getSessionChannelSourceLabel(resolvedChannel.source)})
                      </span>
                    </p>
                    <p className="truncate">
                      Actual:{" "}
                      <span className="font-medium text-foreground">
                        {routingHonesty.actualEndpointLabel}
                      </span>
                    </p>
                  </div>
                  <Badge variant={statusBadgeVariant(match.status)} className="shrink-0">
                    {match.statusLabel}
                  </Badge>
                </div>
                {match.helperText && (
                  <p className="text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
                    {match.helperText}
                  </p>
                )}

                {/* Route intent — secondary control */}
                <div className="flex items-center gap-2 border-t border-border/40 pt-2">
                  <span className="shrink-0 text-[11px] text-muted-foreground">Route intent</span>
                  <Select
                    value={representative.routeIntent}
                    disabled={!representative.routeIntentKey || !controllable || pending}
                    onValueChange={(value) =>
                      applyRouteIntent(value as SessionRouteIntent)
                    }
                  >
                    <SelectTrigger size="sm" className="h-7 flex-1 text-[11px]">
                      <SelectValue placeholder="System" />
                    </SelectTrigger>
                    <SelectContent>
                      {routeIntentOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value} className="text-xs">
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {!controllable && (
                  <p className="text-xs text-muted-foreground">
                    Controls unavailable for this app.
                  </p>
                )}
                {inlineError && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">{inlineError}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!routeCapability.perAppSwitchingSupported && (
        <p className="text-xs text-muted-foreground">
          Audapp groups apps into channels but does not move Windows endpoints automatically.
          Use the Windows Volume Mixer to send an app to a specific Audapp channel.
        </p>
      )}

      <details className="group rounded-2xl border border-border/60 bg-card/60">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Advanced channel rules</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Rules auto-assign new apps to channels. Manual assignment always wins.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <span>{channelRules.length} rule(s)</span>
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
          </div>
        </summary>

        <div className="border-t border-border/50 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Keep this empty if smart defaults are enough for now.
            </p>
            <Button variant="outline" size="xs" onClick={onAddChannelRule}>
              <Plus className="size-3" />
              Add rule
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {channelRules.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/60 px-4 py-5">
                <p className="text-sm font-medium">No channel rules yet.</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Manual assignments and smart defaults still work. Add a rule when you
                  want new apps to auto-assign to a channel.
                </p>
              </div>
            ) : (
              channelRules
                .slice()
                .sort((left, right) => left.priority - right.priority)
                .map((rule) => (
                  <div
                    key={rule.id}
                    className="rounded-xl border border-border/60 bg-background/60 px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground">When</span>
                      <Select
                        value={rule.matchType}
                        onValueChange={(value) =>
                          onUpdateChannelRule(rule.id, {
                            matchType: value as ChannelRule["matchType"],
                          })
                        }
                      >
                        <SelectTrigger size="sm" className="w-[10.5rem] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="process_contains" className="text-xs">
                            process contains
                          </SelectItem>
                          <SelectItem value="process_equals" className="text-xs">
                            process equals
                          </SelectItem>
                          <SelectItem value="session_name_contains" className="text-xs">
                            session name contains
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={rule.pattern}
                        onChange={(event) =>
                          onUpdateChannelRule(rule.id, { pattern: event.target.value })
                        }
                        placeholder="spotify"
                        className="h-8 min-w-40 flex-1 text-xs"
                      />
                      <span className="text-muted-foreground">→</span>
                      <Select
                        value={rule.channelId}
                        onValueChange={(value) =>
                          onUpdateChannelRule(rule.id, { channelId: value })
                        }
                      >
                        <SelectTrigger size="sm" className="w-[10.5rem] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {channels.map((channel) => (
                            <SelectItem key={channel.id} value={channel.id} className="text-xs">
                              {channel.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <label className="flex items-center gap-2">
                          <Switch
                            checked={rule.enabled}
                            size="sm"
                            onCheckedChange={(checked) =>
                              onUpdateChannelRule(rule.id, { enabled: checked })
                            }
                          />
                          <span className="text-muted-foreground">Enabled</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <span className="text-muted-foreground">Priority</span>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            value={rule.priority}
                            onChange={(event) =>
                              onUpdateChannelRule(rule.id, {
                                priority: Number(event.target.value || 0),
                              })
                            }
                            className="h-8 w-20 text-xs"
                          />
                        </label>
                      </div>

                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => onDeleteChannelRule(rule.id)}
                      >
                        <Trash2 className="size-3" />
                        Delete
                      </Button>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {getChannelRuleMatchLabel(rule.matchType)} “{rule.pattern || "…"}”
                    </p>
                  </div>
                ))
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
