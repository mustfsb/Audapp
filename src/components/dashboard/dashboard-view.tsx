import { AlertTriangle, CheckCircle2, Circle, Mic2, MonitorSpeaker, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  discoveryStatusLabel,
  formatDiscoveryRefreshTime,
  sessionDisplayLabel,
  sessionVolumePercent,
} from "@/lib/discovery-display";
import { useAudioEngine } from "@/lib/use-audio-engine";
import { useAudioDsp } from "@/lib/use-audio-dsp";
import type { AudioDiscoveryDevice, AudioDiscoverySession, AudioDiscoveryStatus } from "@/types/discovery";
import type { AudioProfile, EngineStatus } from "@/types/audio";

interface DashboardViewProps {
  engineStatus: EngineStatus;
  discoveryStatus: AudioDiscoveryStatus;
  outputDevice: AudioDiscoveryDevice | undefined;
  inputDevice: AudioDiscoveryDevice | undefined;
  sessions: AudioDiscoverySession[];
  profiles: AudioProfile[];
  isDiscoveryLoading: boolean;
  onRefreshDiscovery: () => void;
}

export function DashboardView({
  discoveryStatus,
  outputDevice,
  inputDevice,
  sessions,
  isDiscoveryLoading,
  onRefreshDiscovery,
}: DashboardViewProps) {
  const { status: engineRuntime } = useAudioEngine();
  const dsp = useAudioDsp();

  const isEngineRunning = engineRuntime.state === "running";
  const isDspActive = dsp.status?.enabled && dsp.status.activeInEngine;
  const warnings = discoveryStatus.warnings;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Overview</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            System status at a glance.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefreshDiscovery}
          disabled={isDiscoveryLoading}
        >
          <RefreshCw className={`size-3.5 ${isDiscoveryLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Status rows */}
      <div className="rounded-xl bg-card divide-y divide-border/50">
        <StatusRow
          label="Discovery"
          value={discoveryStatusLabel(discoveryStatus)}
          sub={formatDiscoveryRefreshTime(discoveryStatus.refreshedAt)}
          active={discoveryStatus.deviceCount > 0}
        />
        <StatusRow
          label="Devices"
          value={`${discoveryStatus.deviceCount} endpoint${discoveryStatus.deviceCount !== 1 ? "s" : ""}`}
          sub={
            outputDevice
              ? `Output: ${outputDevice.name}`
              : inputDevice
                ? `Input: ${inputDevice.name}`
                : "No default endpoint detected"
          }
          active={discoveryStatus.deviceCount > 0}
        />
        <StatusRow
          label="Active sessions"
          value={`${discoveryStatus.sessionCount} session${discoveryStatus.sessionCount !== 1 ? "s" : ""}`}
          sub="From Apps page — volume and mute are real"
          active={discoveryStatus.sessionCount > 0}
        />
        <StatusRow
          label="Mixer"
          value="Local group controls"
          sub="Applies volume/mute to assigned sessions — not routed"
          active={false}
          neutral
        />
        <StatusRow
          label="Audio Engine Lab"
          value={isEngineRunning ? `Running · ${engineRuntime.mode?.replace(/_/g, " ") ?? ""}` : "Stopped"}
          sub={
            isEngineRunning && engineRuntime.sampleRate
              ? `${engineRuntime.sampleRate / 1000} kHz · ${engineRuntime.channels}ch`
              : "Test-only WASAPI streams"
          }
          active={isEngineRunning}
        />
        <StatusRow
          label="DSP / EQ"
          value={
            isDspActive
              ? "Active"
              : dsp.config.enabled
                ? "Enabled (engine stopped)"
                : "Disabled"
          }
          sub="Test-only · Engine Lab streams only"
          active={!!isDspActive}
          neutral={!isDspActive}
        />
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Warnings</p>
          {warnings.map((w) => (
            <div
              key={w}
              className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
              <p className="text-sm text-foreground">{w}</p>
            </div>
          ))}
        </div>
      )}

      {/* Devices quick view */}
      {(outputDevice || inputDevice) && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Default endpoints</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {outputDevice && (
              <div className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5">
                <MonitorSpeaker className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{outputDevice.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{outputDevice.state}</p>
                </div>
              </div>
            )}
            {inputDevice && (
              <div className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5">
                <Mic2 className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{inputDevice.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{inputDevice.state}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active sessions snapshot */}
      {sessions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Active sessions ({sessions.length})
          </p>
          <div className="divide-y divide-border/50 rounded-xl bg-card">
            {sessions.slice(0, 6).map((session) => {
              const volume = sessionVolumePercent(session);
              return (
                <div
                  key={session.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{sessionDisplayLabel(session)}</p>
                    {session.muted && (
                      <p className="text-xs text-muted-foreground">Muted</p>
                    )}
                  </div>
                  {volume !== null && (
                    <div className="flex w-24 items-center gap-2">
                      <Progress value={volume} className="h-1" />
                      <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                        {volume}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
            {sessions.length > 6 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                +{sessions.length - 6} more sessions — see Apps page
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusRow({
  label,
  value,
  sub,
  active,
  neutral,
}: {
  label: string;
  value: string;
  sub: string;
  active: boolean;
  neutral?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {neutral ? (
        <Circle className="size-3.5 shrink-0 text-muted-foreground/40" />
      ) : active ? (
        <CheckCircle2 className="size-3.5 shrink-0 text-green-500" />
      ) : (
        <Circle className="size-3.5 shrink-0 text-muted-foreground/40" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="text-sm text-muted-foreground">{value}</span>
        </div>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}
