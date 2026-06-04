import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, RefreshCw, RotateCcw, Trash2, Volume2, VolumeX } from "lucide-react";

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
  getChannelRuleMatchLabel,
  getSessionChannelSourceLabel,
  type ResolvedInternalChannel,
} from "@/lib/channel-workflow";
import { sessionDisplayLabel, sessionVolumePercent } from "@/lib/discovery-display";
import { formatRouteApplyStatus } from "@/lib/session-route-status";
import { isSessionControllable } from "@/lib/session-target";
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

function SessionVolumeControl({
  session,
  disabled,
  isPending,
  onVolumeCommit,
}: {
  session: AudioSessionView;
  disabled: boolean;
  isPending: boolean;
  onVolumeCommit: (session: AudioSessionView, volumePercent: number) => void;
}) {
  const discoveredVolume = sessionVolumePercent(session) ?? 0;
  const [draftVolume, setDraftVolume] = useState(discoveredVolume);
  const liveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraftVolume(discoveredVolume);
  }, [discoveredVolume, session.id]);

  useEffect(() => {
    return () => {
      if (liveTimerRef.current !== null) {
        clearTimeout(liveTimerRef.current);
      }
    };
  }, []);

  function handleValueChange(values: number[]) {
    const value = values[0] ?? draftVolume;
    setDraftVolume(value);
    if (liveTimerRef.current !== null) {
      clearTimeout(liveTimerRef.current);
    }
    liveTimerRef.current = setTimeout(() => {
      liveTimerRef.current = null;
      onVolumeCommit(session, value);
    }, LIVE_VOLUME_THROTTLE_MS);
  }

  function handleValueCommit(values: number[]) {
    const value = values[0] ?? draftVolume;
    if (liveTimerRef.current !== null) {
      clearTimeout(liveTimerRef.current);
      liveTimerRef.current = null;
    }
    onVolumeCommit(session, value);
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
        {draftVolume}%{isPending ? "..." : ""}
      </span>
    </div>
  );
}

function describeResolvedChannel(resolvedChannel: ResolvedInternalChannel): string {
  if (resolvedChannel.source === "rule" && resolvedChannel.rule) {
    return `Matched rule: ${getChannelRuleMatchLabel(resolvedChannel.rule.matchType)} "${resolvedChannel.rule.pattern}".`;
  }

  if (resolvedChannel.source === "manual") {
    return "Manual assignment overrides rules and smart defaults.";
  }

  if (resolvedChannel.source === "smart_default") {
    return "Auto-assigned by Audapp smart defaults.";
  }

  return "Using the Audapp General fallback because no manual assignment or rule matched.";
}

export function AppsView({
  sessions,
  channels,
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
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Apps</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Per-app output switching is experimental. Internal Audapp channels are
            separate from Windows endpoint routing.
          </p>
          {!routeCapability.perAppSwitchingSupported && (
            <p className="mt-1 text-xs text-muted-foreground">
              {routeCapability.statusReason} Manual fallback: {routeCapability.manualFallback}
            </p>
          )}
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
        <div className="rounded-xl bg-card px-4 py-8 text-center">
          <p className="text-sm font-medium text-muted-foreground">No active sessions</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Start audio playback in an application, then refresh.
          </p>
        </div>
      ) : (
        <div className="grid gap-2 xl:grid-cols-2">
          {sessions.map((session) => {
            const resolvedChannel = resolveChannelForSession(session);
            const controllable = isSessionControllable(session);
            const pending = isSessionPending(session);
            const inlineError = sessionError(session);
            const disabled = !controllable || pending || isAssignmentsLoading;

            return (
              <div key={session.id} className="space-y-3 rounded-xl bg-card px-4 py-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-tight">
                      {sessionDisplayLabel(session)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {session.processName ?? "Unknown process"}
                      {session.processId ? ` | PID ${session.processId}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {session.muted && (
                      <span className="text-xs text-muted-foreground">Muted</span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground"
                      disabled={disabled}
                      onClick={() => onMuteToggle(session, !session.muted)}
                      title={session.muted ? "Unmute" : "Mute"}
                    >
                      {session.muted ? (
                        <VolumeX className="size-3.5" />
                      ) : (
                        <Volume2 className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </div>

                <SessionVolumeControl
                  session={session}
                  disabled={!controllable}
                  isPending={pending}
                  onVolumeCommit={onVolumeCommit}
                />

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Route intent
                    </span>
                    <Select
                      value={session.routeIntent}
                      disabled={!session.routeIntentKey || disabled}
                      onValueChange={(value) =>
                        onRouteIntentChange(session, value as SessionRouteIntent)
                      }
                    >
                      <SelectTrigger className="h-7 flex-1 text-xs">
                        <SelectValue placeholder="System" />
                      </SelectTrigger>
                      <SelectContent>
                        {routeIntentOptions.map((option) => (
                          <SelectItem
                            key={option.value}
                            value={option.value}
                            className="text-xs"
                          >
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Route intent is stored separately from Audapp internal channel grouping.
                  </p>
                  {session.routeStatus && (
                    <div className="space-y-1 rounded-lg border border-border/60 bg-background/60 px-2.5 py-2">
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Apply status: {formatRouteApplyStatus(session.routeStatus.applyStatus)}
                      </p>
                      <p className="text-[11px] leading-relaxed text-muted-foreground">
                        Applied endpoint: {session.routeStatus.appliedEndpointName ?? "none"}
                      </p>
                      {session.routeStatus.note && (
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          {session.routeStatus.note}
                        </p>
                      )}
                      {session.routeStatus.lastError && (
                        <p className="text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
                          {session.routeStatus.lastError}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs text-muted-foreground">Channel</span>
                    <Select
                      value={resolvedChannel.channelId}
                      disabled={isAssignmentsLoading || pending}
                      onValueChange={(value) => onChannelChange(session, value)}
                    >
                      <SelectTrigger className="h-7 flex-1 text-xs">
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
                        disabled={isAssignmentsLoading || pending}
                        onClick={() => onResetManualAssignment(session)}
                      >
                        <RotateCcw className="size-3" />
                        Reset manual
                      </Button>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {getSessionChannelSourceLabel(resolvedChannel.source)} |{" "}
                    {describeResolvedChannel(resolvedChannel)}
                  </p>
                </div>

                {!controllable && (
                  <p className="text-xs text-muted-foreground">
                    Controls unavailable for this session.
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

      <details className="group rounded-xl border border-border/70 bg-card/60">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Advanced channel rules</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Rules auto-assign new sessions to Audapp internal channels. Manual
              session assignment always wins.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            <span>{channelRules.length} rule(s)</span>
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
          </div>
        </summary>

        <div className="border-t border-border/60 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Keep this list empty if smart defaults are enough for now.
            </p>
            <Button variant="outline" size="xs" onClick={onAddChannelRule}>
              <Plus className="size-3" />
              Add rule
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {channelRules.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border/70 px-4 py-5">
                <p className="text-sm font-medium">No channel rules yet.</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Manual assignments and smart defaults still work. Add a rule when
                  you want new sessions to auto-assign to a channel.
                </p>
              </div>
            ) : (
              channelRules
                .slice()
                .sort((left, right) => left.priority - right.priority)
                .map((rule) => (
                  <div
                    key={rule.id}
                    className="rounded-xl border border-border/70 bg-background/60 px-3 py-3"
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
                        <SelectTrigger className="h-7 w-[10.5rem] text-xs">
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
                        className="h-7 min-w-40 flex-1 text-xs"
                      />
                      <span className="text-muted-foreground">-&gt;</span>
                      <Select
                        value={rule.channelId}
                        onValueChange={(value) =>
                          onUpdateChannelRule(rule.id, { channelId: value })
                        }
                      >
                        <SelectTrigger className="h-7 w-[10.5rem] text-xs">
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
                            className="h-7 w-20 text-xs"
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
                  </div>
                ))
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
