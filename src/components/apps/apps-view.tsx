import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Gamepad2,
  Globe,
  Music,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";

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
import {
  getChannelRuleMatchLabel,
  type ResolvedInternalChannel,
} from "@/lib/channel-workflow";
import {
  summarizeRoutingMatch,
  summarizeSessionRoutingHonesty,
} from "@/lib/session-routing-honesty";
import { cn } from "@/lib/utils";
import type { AudioChannel } from "@/types/audio";
import type { AudioDiscoveryDevice, AudioDiscoverySession } from "@/types/discovery";
import type {
  ChannelRule,
  SessionRouteCapability,
  SessionRouteIntent,
} from "@/types/session-control";
import type { AudioSessionView } from "@/types/session-view";

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  general: Volume2,
  game: Gamepad2,
  music: Music,
  browser: Globe,
};

const LIVE_VOLUME_THROTTLE_MS = 100;

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

  useEffect(() => { setDraftVolume(value); }, [value]);
  useEffect(() => {
    return () => { if (liveTimerRef.current !== null) clearTimeout(liveTimerRef.current); };
  }, []);

  function handleValueChange(values: number[]) {
    const next = values[0] ?? draftVolume;
    setDraftVolume(next);
    if (liveTimerRef.current !== null) clearTimeout(liveTimerRef.current);
    liveTimerRef.current = setTimeout(() => { liveTimerRef.current = null; onCommit(next); }, LIVE_VOLUME_THROTTLE_MS);
  }

  function handleValueCommit(values: number[]) {
    const next = values[0] ?? draftVolume;
    if (liveTimerRef.current !== null) { clearTimeout(liveTimerRef.current); liveTimerRef.current = null; }
    onCommit(next);
  }

  return (
    <div className="flex flex-1 items-center gap-2">
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
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
        {draftVolume}%{isPending ? "…" : ""}
      </span>
    </div>
  );
}

function AppRow({
  group,
  channels,
  outputDevices,
  resolveChannelForSession,
  isAssignmentsLoading,
  isSessionPending,
  sessionError,
  routeIntentOptions,
  onRouteIntentChange,
  onChannelChange,
  onResetManualAssignment,
  onVolumeCommit,
  onMuteToggle,
}: {
  group: AppSessionGroup<AudioSessionView>;
  channels: AudioChannel[];
  outputDevices: AudioDiscoveryDevice[];
  resolveChannelForSession: (session: AudioDiscoverySession) => ResolvedInternalChannel;
  isAssignmentsLoading: boolean;
  isSessionPending: (session: AudioDiscoverySession) => boolean;
  sessionError: (session: AudioDiscoverySession) => string | null;
  routeIntentOptions: Array<{ value: SessionRouteIntent; label: string }>;
  onRouteIntentChange: (session: AudioSessionView, intent: SessionRouteIntent) => void;
  onChannelChange: (session: AudioSessionView, channelId: string) => void;
  onResetManualAssignment: (session: AudioSessionView) => void;
  onVolumeCommit: (session: AudioSessionView, volumePercent: number) => void;
  onMuteToggle: (session: AudioSessionView, muted: boolean) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);

  const representative = group.representative;
  const resolvedChannel = resolveChannelForSession(representative);
  const routingHonesty = summarizeSessionRoutingHonesty(representative, resolvedChannel, outputDevices);
  const match = summarizeRoutingMatch(resolvedChannel.channel.id, routingHonesty);
  const pending = group.underlyingSessions.some((s) => isSessionPending(s));
  const inlineError = group.underlyingSessions.map((s) => sessionError(s)).find(Boolean) ?? null;
  const controllable = group.anyControllable;
  const channelDisabled = isAssignmentsLoading || pending;

  const controllableSessions = group.underlyingSessions.filter(
    (s) => s.state !== "expired" && Boolean(s.deviceId),
  );

  return (
    <div className={cn("px-4 py-3", pending && "opacity-60")}>
      {/* Primary row: name · volume · mute · toggle */}
      <div className="flex items-center gap-3">
        <div className="min-w-0 w-32 shrink-0">
          <p className="truncate text-sm font-medium">{group.displayName}</p>
          {group.sessionCount > 1 && (
            <p className="text-[10px] text-muted-foreground">{group.sessionCount} sessions</p>
          )}
        </div>

        <VolumeControl
          value={group.volume ?? 0}
          disabled={!controllable}
          isPending={pending}
          onCommit={(v) => { for (const s of controllableSessions) onVolumeCommit(s, v); }}
        />

        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-muted-foreground"
          disabled={!controllable || pending}
          onClick={() => { for (const s of controllableSessions) onMuteToggle(s, !group.muted); }}
          title={group.muted ? "Unmute" : "Mute"}
        >
          {group.muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
        </Button>

        <button
          onClick={() => setShowDetails((v) => !v)}
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/40 transition-colors hover:text-muted-foreground"
          aria-label="Show channel and routing details"
        >
          <ChevronDown
            className={cn("size-3.5 transition-transform duration-150", showDetails && "rotate-180")}
          />
        </button>
      </div>

      {/* Routing status — always visible, subtle */}
      <div className="mt-1 flex items-center gap-1.5">
        <span className="truncate text-[11px] text-muted-foreground/50">
          {routingHonesty.actualEndpointLabel}
        </span>
        <span
          className={cn(
            "shrink-0 text-[11px]",
            match.status === "ok" && "text-green-600/70 dark:text-green-500/70",
            match.status === "warning" && "text-amber-500 dark:text-amber-400",
            match.status === "info" && "text-muted-foreground/50",
            match.status === "neutral" && "text-muted-foreground/35",
          )}
        >
          · {match.statusLabel}
        </span>
      </div>

      {match.helperText && (
        <p className="mt-0.5 text-[11px] text-amber-500/70 dark:text-amber-400/70">
          {match.helperText}
        </p>
      )}

      {/* Details: channel select + intent select, side by side */}
      {showDetails && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Select
            value={resolvedChannel.channelId}
            disabled={channelDisabled}
            onValueChange={(value) => onChannelChange(representative, value)}
          >
            <SelectTrigger size="sm" className="w-36 text-xs bg-muted/50 border-border/30">
              <SelectValue placeholder="Assign" />
            </SelectTrigger>
            <SelectContent>
              {channels.map((ch) => (
                <SelectItem key={ch.id} value={ch.id} className="text-xs">
                  {ch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {representative.routeIntentKey && controllable && (
            <Select
              value={representative.routeIntent}
              disabled={pending}
              onValueChange={(v) => {
                for (const s of group.underlyingSessions) {
                  if (s.routeIntentKey) onRouteIntentChange(s, v as SessionRouteIntent);
                }
              }}
            >
              <SelectTrigger size="sm" className="w-36 text-[11px] bg-muted/50 border-border/30">
                <SelectValue placeholder="System" />
              </SelectTrigger>
              <SelectContent>
                {routeIntentOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {resolvedChannel.assignment && (
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground"
              disabled={channelDisabled}
              onClick={() => onResetManualAssignment(representative)}
              title="Reset to smart default"
            >
              <RotateCcw className="size-3" />
            </Button>
          )}
        </div>
      )}

      {inlineError && (
        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{inlineError}</p>
      )}
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

  // Group app groups by their resolved channel.
  const groupsByChannel = channels.map((channel) => ({
    channel,
    groups: appGroups.filter(
      (group) => resolveChannelForSession(group.representative).channelId === channel.id,
    ),
  }));

  const totalApps = appGroups.length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Apps</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Group each app into an Audapp channel.
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

      {totalApps === 0 ? (
        <div className="rounded-2xl bg-card px-4 py-10 text-center">
          <p className="text-sm font-medium text-muted-foreground">No active apps</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Start audio playback in an application, then refresh.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupsByChannel.map(({ channel, groups }) => {
            const Icon = CHANNEL_ICONS[channel.id] ?? Volume2;
            return (
              <section key={channel.id} className="space-y-1.5">
                <div className="flex items-center gap-2 px-0.5">
                  <Icon className="size-3.5 text-muted-foreground" />
                  <p className="text-xs font-medium text-muted-foreground">
                    {channel.name}
                    <span className="ml-1.5 text-muted-foreground/50">
                      {groups.length === 0
                        ? "· no apps"
                        : `· ${groups.length} app${groups.length !== 1 ? "s" : ""}`}
                    </span>
                  </p>
                </div>

                <div className="divide-y divide-border/30 rounded-2xl bg-muted/20">
                  {groups.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-muted-foreground/50">
                      No apps routed here.
                    </p>
                  ) : (
                    groups.map((group) => (
                      <AppRow
                        key={group.key}
                        group={group}
                        channels={channels}
                        outputDevices={outputDevices}
                        resolveChannelForSession={resolveChannelForSession}
                        isAssignmentsLoading={isAssignmentsLoading}
                        isSessionPending={isSessionPending}
                        sessionError={sessionError}
                        routeIntentOptions={routeIntentOptions}
                        onRouteIntentChange={onRouteIntentChange}
                        onChannelChange={onChannelChange}
                        onResetManualAssignment={onResetManualAssignment}
                        onVolumeCommit={onVolumeCommit}
                        onMuteToggle={onMuteToggle}
                      />
                    ))
                  )}
                </div>
              </section>
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
            <span>{channelRules.length} rule{channelRules.length !== 1 ? "s" : ""}</span>
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
                .sort((a, b) => a.priority - b.priority)
                .map((rule) => (
                  <div
                    key={rule.id}
                    className="rounded-xl border border-border/60 bg-background/60 px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground">When</span>
                      <Select
                        value={rule.matchType}
                        onValueChange={(v) =>
                          onUpdateChannelRule(rule.id, { matchType: v as ChannelRule["matchType"] })
                        }
                      >
                        <SelectTrigger size="sm" className="w-[10.5rem] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="process_contains" className="text-xs">process contains</SelectItem>
                          <SelectItem value="process_equals" className="text-xs">process equals</SelectItem>
                          <SelectItem value="session_name_contains" className="text-xs">session name contains</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={rule.pattern}
                        onChange={(e) => onUpdateChannelRule(rule.id, { pattern: e.target.value })}
                        placeholder="spotify"
                        className="h-8 min-w-40 flex-1 text-xs"
                      />
                      <span className="text-muted-foreground">→</span>
                      <Select
                        value={rule.channelId}
                        onValueChange={(v) => onUpdateChannelRule(rule.id, { channelId: v })}
                      >
                        <SelectTrigger size="sm" className="w-[10.5rem] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {channels.map((ch) => (
                            <SelectItem key={ch.id} value={ch.id} className="text-xs">
                              {ch.name}
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
                            onChange={(e) =>
                              onUpdateChannelRule(rule.id, { priority: Number(e.target.value || 0) })
                            }
                            className="h-8 w-20 text-xs"
                          />
                        </label>
                      </div>
                      <Button variant="ghost" size="xs" onClick={() => onDeleteChannelRule(rule.id)}>
                        <Trash2 className="size-3" />
                        Delete
                      </Button>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {getChannelRuleMatchLabel(rule.matchType)} "{rule.pattern || "…"}"
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
