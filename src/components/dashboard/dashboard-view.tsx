import {
  Gamepad2,
  Globe,
  Mic2,
  MonitorSpeaker,
  Music,
  RefreshCw,
  Volume2,
  VolumeX,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { mockSessions } from "@/data/mock-audio";
import type { AudioChannel, AudioDevice } from "@/types/audio";

const channelIcons: Record<string, React.ElementType> = {
  general: Volume2,
  game: Gamepad2,
  browser: Globe,
  music: Music,
};

interface DashboardViewProps {
  devices: AudioDevice[];
  selectedOutputId: string;
  selectedInputId: string;
  onSelectOutput: (id: string) => void;
  onSelectInput: (id: string) => void;
  channels: AudioChannel[];
  onVolumeChange: (id: string, value: number) => void;
  onVolumeCommit: (id: string, value: number) => void;
  onMuteToggle: (id: string, muted: boolean) => void;
  isDiscoveryLoading: boolean;
  onRefreshDiscovery: () => void;
}

export function DashboardView({
  devices,
  selectedOutputId,
  selectedInputId,
  onSelectOutput,
  onSelectInput,
  channels,
  onVolumeChange,
  onVolumeCommit,
  onMuteToggle,
  isDiscoveryLoading,
  onRefreshDiscovery,
}: DashboardViewProps) {
  const outputDevices = devices.filter((d) => d.kind === "output");
  const inputDevices = devices.filter((d) => d.kind === "input");

  return (
    <div className="max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Overview</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Control center</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefreshDiscovery}
          disabled={isDiscoveryLoading}
        >
          <RefreshCw className={cn("size-3.5", isDiscoveryLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Device Selectors */}
      <div className="grid grid-cols-2 gap-3">
        <DeviceSelector
          label="Output"
          icon={MonitorSpeaker}
          devices={outputDevices}
          selectedId={selectedOutputId}
          onSelect={onSelectOutput}
        />
        <DeviceSelector
          label="Input"
          icon={Mic2}
          devices={inputDevices}
          selectedId={selectedInputId}
          onSelect={onSelectInput}
        />
      </div>

      {/* Mixer */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Mixer</p>
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

      {/* Sessions Snapshot */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          Active sessions ({mockSessions.length})
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {mockSessions.map((session) => (
            <div
              key={session.id}
              className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{session.name}</p>
                <p className="truncate text-xs text-muted-foreground">{session.process}</p>
              </div>
              <div className="flex w-28 items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground/30"
                    style={{ width: `${session.volume}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                  {session.volume}%
                </span>
              </div>
            </div>
          ))}
        </div>
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
}: {
  label: string;
  icon: React.ElementType;
  devices: AudioDevice[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selected = devices.find((d) => d.id === selectedId) ?? devices[0];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5 text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <div className="overflow-hidden rounded-xl bg-card divide-y divide-border/50">
        {selected && (
          <div className="bg-sidebar-accent/60 px-3.5 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium leading-tight">{selected.name}</p>
              <span
                className={cn(
                  "mt-0.5 inline-block size-1.5 shrink-0 rounded-full",
                  selected.health === "Healthy" ? "bg-green-500" : "bg-amber-500",
                )}
              />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selected.connection} · {selected.sampleRate / 1000} kHz · {selected.bitDepth}-bit
            </p>
          </div>
        )}
        {devices
          .filter((d) => d.id !== selected?.id)
          .map((device) => (
            <button
              key={device.id}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/50"
              onClick={() => onSelect(device.id)}
            >
              <span
                className={cn(
                  "inline-block size-1.5 shrink-0 rounded-full",
                  device.health === "Healthy" ? "bg-green-500/60" : "bg-amber-500/60",
                )}
              />
              <span className="truncate text-sm text-muted-foreground">{device.name}</span>
            </button>
          ))}
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
