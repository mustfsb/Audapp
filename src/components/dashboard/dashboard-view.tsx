import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Gamepad2,
  Globe,
  Mic2,
  MonitorSpeaker,
  Music,
  Power,
  RefreshCw,
  Volume2,
  VolumeX,
} from "lucide-react";

import { AudappChannelsStatus } from "@/components/audapp/audapp-channels-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { groupSessionsIntoApps } from "@/lib/app-session-group";
import type { StatusKind } from "@/lib/badge-variant";
import type { AudappChannelEndpoint } from "@/lib/audapp-endpoints";
import { useMultichannelBridge } from "@/lib/use-multichannel-bridge";
import { useOutputDevicePreferences } from "@/lib/use-output-device-preferences";
import { cn } from "@/lib/utils";
import type { AudioChannel } from "@/types/audio";
import type { AudioDiscoveryDevice } from "@/types/discovery";
import type { AudioSessionView } from "@/types/session-view";

const channelIcons: Record<string, React.ElementType> = {
  general: Volume2,
  game: Gamepad2,
  browser: Globe,
  music: Music,
};

interface DashboardViewProps {
  audappChannelEndpoints: AudappChannelEndpoint[];
  devices: AudioDiscoveryDevice[];
  sessions: AudioSessionView[];
  channels: AudioChannel[];
  onVolumeChange: (id: string, value: number) => void;
  onVolumeCommit: (id: string, value: number) => void;
  onMuteToggle: (id: string, muted: boolean) => void;
  isDiscoveryLoading: boolean;
  onRefreshDiscovery: () => void;
}

export function DashboardView({
  audappChannelEndpoints,
  devices,
  sessions,
  channels,
  onVolumeChange,
  onVolumeCommit,
  onMuteToggle,
  isDiscoveryLoading,
  onRefreshDiscovery,
}: DashboardViewProps) {
  const bridge = useMultichannelBridge();
  const { status } = bridge;
  const outputPreferences = useOutputDevicePreferences();

  const outputDevices = devices.filter((d) => d.kind === "output" && !d.isAudappEndpoint);
  const inputDevices = devices.filter((d) => d.kind === "input");

  const defaultOutputDevice = outputDevices.find((d) => d.isDefault) ?? outputDevices[0];
  const defaultInputDevice = inputDevices.find((d) => d.isDefault) ?? inputDevices[0];

  const [selectedOutputId, setSelectedOutputId] = useState<string>(defaultOutputDevice?.id ?? "");
  const [selectedInputId, setSelectedInputId] = useState<string>(defaultInputDevice?.id ?? "");
  const [isSwitchingOutput, setIsSwitchingOutput] = useState(false);

  // Sync selected output with the actual device being used:
  // - bridge running → use the device the bridge is actively routing to
  // - bridge stopped → use the preference-resolved device (primary → fallback → auto)
  const authorativeOutputId = status.running
    ? (status.monitorOutput.outputId ?? outputPreferences.status.resolvedOutputId)
    : outputPreferences.status.resolvedOutputId;

  useEffect(() => {
    if (authorativeOutputId) setSelectedOutputId(authorativeOutputId);
  }, [authorativeOutputId]);

  const handleSelectOutput = useCallback(
    async (id: string) => {
      setSelectedOutputId(id);
      if (!status.running) return;
      setIsSwitchingOutput(true);
      try {
        await bridge.stop();
        await bridge.start(id);
      } finally {
        setIsSwitchingOutput(false);
      }
    },
    [status.running, bridge],
  );

  const availableChannels = audappChannelEndpoints.filter((endpoint) => endpoint.available).length;
  const totalChannels = audappChannelEndpoints.length;
  const allChannelsReady = totalChannels > 0 && availableChannels === totalChannels;

  const defaultOutput = devices.find((device) => device.kind === "output" && device.isDefault);
  const outputName =
    status.monitorOutput.outputName ??
    status.monitorOutput.defaultRenderName ??
    defaultOutput?.name ??
    "No output detected";

  const activeSessions = sessions.filter(
    (session) => session.state === "active" && Boolean(session.deviceId),
  );
  const activeApps = groupSessionsIntoApps(activeSessions);

  // Collect anything the user should know about.
  const warnings: string[] = [];
  if (status.lastError) warnings.push(status.lastError);
  if (status.monitorOutput.isPhysicalOutputAudapp) {
    warnings.push("Bridge output resolved to an Audapp endpoint — pick a physical output.");
  }
  for (const endpoint of audappChannelEndpoints) {
    if (!endpoint.available) warnings.push(`${endpoint.label} channel endpoint is missing.`);
  }

  const overall: { kind: StatusKind; label: string; detail: string } = status.lastError
    ? { kind: "error", label: "Routing error", detail: status.lastError }
    : status.running && allChannelsReady
      ? { kind: "ok", label: "Audapp is routing", detail: `Mixing to ${outputName}` }
      : status.running
        ? {
            kind: "warning",
            label: "Routing with warnings",
            detail: `${availableChannels}/${totalChannels} channels available`,
          }
        : {
            kind: "neutral",
            label: "Routing stopped",
            detail: allChannelsReady
              ? "All channels ready — start routing to mix them."
              : `${availableChannels}/${totalChannels} channels available`,
          };

  const StatusIcon =
    overall.kind === "ok" ? CheckCircle2 : overall.kind === "error" ? AlertTriangle : Power;

  return (
    <div className="max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Overview</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Live Audapp routing status</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            onRefreshDiscovery();
            void bridge.refresh();
          }}
          disabled={isDiscoveryLoading}
        >
          <RefreshCw className={cn("size-3.5", isDiscoveryLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Primary status banner */}
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-card px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-10 items-center justify-center rounded-full",
              overall.kind === "ok" && "bg-green-500/15 text-green-600 dark:text-green-400",
              overall.kind === "warning" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
              overall.kind === "error" && "bg-destructive/15 text-destructive",
              overall.kind === "neutral" && "bg-muted text-muted-foreground",
            )}
          >
            <StatusIcon className="size-5" />
          </span>
          <div>
            <p className="text-base font-semibold leading-tight">{overall.label}</p>
            <p className="text-sm text-muted-foreground">{overall.detail}</p>
          </div>
        </div>
        <Button
          variant={status.running ? "destructive" : "default"}
          size="sm"
          disabled={bridge.isLoading || isSwitchingOutput}
          onClick={() =>
            status.running
              ? void bridge.stop()
              : void bridge.start(selectedOutputId || null)
          }
        >
          <Power className="size-3.5" />
          {status.running ? "Stop routing" : "Start routing"}
        </Button>
      </div>

      {/* Device selectors */}
      <div className="grid grid-cols-2 gap-3">
        <DeviceSelector
          label="Output"
          icon={MonitorSpeaker}
          devices={outputDevices}
          selectedId={selectedOutputId}
          onSelect={(id) => void handleSelectOutput(id)}
          busy={isSwitchingOutput}
        />
        <DeviceSelector
          label="Input"
          icon={Mic2}
          devices={inputDevices}
          selectedId={selectedInputId}
          onSelect={setSelectedInputId}
        />
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="rounded-2xl bg-amber-500/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              {warnings.length} thing{warnings.length !== 1 ? "s" : ""} need attention
            </p>
          </div>
          <ul className="mt-1.5 space-y-0.5 pl-6 text-xs text-amber-700/90 dark:text-amber-300/90">
            {warnings.slice(0, 4).map((warning, index) => (
              <li key={index} className="list-disc">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Channels */}
      <AudappChannelsStatus
        endpoints={audappChannelEndpoints}
        title="Channels"
        description="Each channel maps to a Windows AudappChannels endpoint when present."
      />

      {/* Quick mixer */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Quick mixer</p>
        <div className="divide-y divide-border/50 rounded-xl bg-card">
          {channels.map((channel) => {
            const Icon = channelIcons[channel.id] ?? Volume2;
            return (
              <HorizontalChannelStrip
                key={channel.id}
                channel={channel}
                icon={Icon}
                onVolumeChange={onVolumeChange}
                onVolumeCommit={onVolumeCommit}
                onMuteToggle={onMuteToggle}
              />
            );
          })}
        </div>
      </div>

      {/* Active apps */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          Active apps ({activeApps.length})
        </p>
        {activeApps.length === 0 ? (
          <div className="rounded-xl bg-card px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">No apps are playing audio right now.</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {activeApps.map((group) => (
              <div
                key={group.key}
                className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{group.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {group.processName ?? "Unknown process"}
                  </p>
                </div>
                {group.sessionCount > 1 && (
                  <Badge variant="secondary">{group.sessionCount}</Badge>
                )}
                <div className="flex w-24 items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-foreground/30"
                      style={{ width: `${group.volume ?? 0}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                    {group.volume ?? 0}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DeviceSelector({
  label,
  icon: Icon,
  devices,
  selectedId,
  onSelect,
  busy = false,
}: {
  label: string;
  icon: React.ElementType;
  devices: AudioDiscoveryDevice[];
  selectedId: string;
  onSelect: (id: string) => void;
  busy?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const selected = devices.find((d) => d.id === selectedId) ?? devices[0];
  const others = devices.filter((d) => d.id !== selected?.id);

  // Collapsed: show at most 1 other device (so total visible = selected + 1 = 2).
  const visibleOthers = expanded ? others : others.slice(0, 1);
  const hiddenCount = others.length - visibleOthers.length;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5 text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {busy && <RefreshCw className="size-3 animate-spin text-muted-foreground" />}
      </div>
      <div
        className={cn(
          "overflow-hidden rounded-xl bg-card divide-y divide-border/50",
          busy && "pointer-events-none opacity-60",
        )}
      >
        {selected && (
          <div className="bg-sidebar-accent/60 px-3.5 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium leading-tight">{selected.name}</p>
              <span
                className={cn(
                  "mt-0.5 inline-block size-1.5 shrink-0 rounded-full",
                  selected.state === "active" ? "bg-green-500" : "bg-amber-500",
                )}
              />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selected.isDefault ? "Default device" : selected.state}
            </p>
          </div>
        )}

        {visibleOthers.map((device) => (
          <button
            key={device.id}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/50"
            onClick={() => onSelect(device.id)}
          >
            <span
              className={cn(
                "inline-block size-1.5 shrink-0 rounded-full",
                device.state === "active" ? "bg-green-500/60" : "bg-amber-500/60",
              )}
            />
            <span className="truncate text-sm text-muted-foreground">{device.name}</span>
          </button>
        ))}

        {others.length > 1 && (
          <button
            className="flex w-full items-center gap-1.5 px-3.5 py-2 text-left transition-colors hover:bg-muted/50"
            onClick={() => setExpanded((v) => !v)}
          >
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                expanded && "rotate-180",
              )}
            />
            <span className="text-xs text-muted-foreground">
              {expanded ? "Show less" : `${hiddenCount} more`}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

function HorizontalChannelStrip({
  channel,
  icon: Icon,
  onVolumeChange,
  onVolumeCommit,
  onMuteToggle,
}: {
  channel: AudioChannel;
  icon: React.ElementType;
  onVolumeChange: (id: string, value: number) => void;
  onVolumeCommit: (id: string, value: number) => void;
  onMuteToggle: (id: string, muted: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 transition-opacity",
        channel.muted && "opacity-50",
      )}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="w-16 shrink-0 text-sm">{channel.name}</span>
      <Slider
        className="flex-1"
        value={[channel.volume]}
        min={0}
        max={100}
        step={1}
        onValueChange={(values) => onVolumeChange(channel.id, values[0] ?? channel.volume)}
        onValueCommit={(values) => onVolumeCommit(channel.id, values[0] ?? channel.volume)}
      />
      <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
        {channel.volume}%
      </span>
      <Button
        variant={channel.muted ? "destructive" : "ghost"}
        size="icon"
        className="size-7 shrink-0"
        onClick={() => onMuteToggle(channel.id, !channel.muted)}
        aria-label={channel.muted ? `Unmute ${channel.name}` : `Mute ${channel.name}`}
      >
        {channel.muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
      </Button>
    </div>
  );
}
