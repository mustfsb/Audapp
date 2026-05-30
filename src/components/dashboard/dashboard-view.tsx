import { Activity, AlertTriangle, Mic2, MonitorSpeaker, RefreshCw, Sparkles, Waves } from "lucide-react";

import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  discoveryStatusLabel,
  formatDiscoveryRefreshTime,
  sessionDisplayLabel,
  sessionProcessLabel,
  sessionVolumePercent,
} from "@/lib/discovery-display";
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
  engineStatus,
  discoveryStatus,
  outputDevice,
  inputDevice,
  sessions,
  profiles,
  isDiscoveryLoading,
  onRefreshDiscovery,
}: DashboardViewProps) {
  const activeProfile = profiles.find((profile) => profile.active);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="System overview"
        title="Desktop routing foundation"
        description="Monitor Windows audio discovery, device focus, and engine posture. Session volume/mute control is available from the Apps page. Routing and DSP remain out of scope."
        actions={
          <Button variant="outline" size="sm" onClick={onRefreshDiscovery} disabled={isDiscoveryLoading}>
            <RefreshCw className={`size-4 ${isDiscoveryLoading ? "animate-spin" : ""}`} />
            Refresh discovery
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Windows audio discovery</CardTitle>
            <CardDescription>Live device and session counts from Core Audio.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="gap-1">
                <Activity className="size-3.5" />
                {discoveryStatusLabel(discoveryStatus)}
              </Badge>
              <Badge variant="outline">{discoveryStatus.deviceCount} devices</Badge>
              <Badge variant="outline">{discoveryStatus.sessionCount} sessions</Badge>
              <Badge variant="secondary">{activeProfile?.name ?? "No profile"} active</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Last refresh: {formatDiscoveryRefreshTime(discoveryStatus.refreshedAt)}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Engine CPU (mock)</span>
                  <span className="text-sm font-medium">{engineStatus.cpuLoad}%</span>
                </div>
                <Progress value={engineStatus.cpuLoad} />
              </div>
              <div className="rounded-md bg-muted/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Engine audio (mock)</span>
                  <span className="text-sm font-medium">{engineStatus.audioLoad}%</span>
                </div>
                <Progress value={engineStatus.audioLoad} />
              </div>
            </div>
          </CardContent>
        </Card>

        <DeviceCard
          icon={MonitorSpeaker}
          title="Default output"
          name={outputDevice?.name ?? "Unavailable"}
          detail={outputDevice ? `State: ${outputDevice.state}` : "No default output detected"}
        />
        <DeviceCard
          icon={Mic2}
          title="Default input"
          name={inputDevice?.name ?? "Unavailable"}
          detail={inputDevice ? `State: ${inputDevice.state}` : "No default input detected"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Warnings and status area</CardTitle>
            <CardDescription>Discovery warnings plus mock engine notices.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {[...discoveryStatus.warnings, ...engineStatus.warnings].map((warning) => (
              <div
                key={warning}
                className="flex items-start gap-3 rounded-md bg-amber-500/10 px-3 py-3"
              >
                <AlertTriangle className="mt-0.5 size-4 text-amber-500" />
                <p className="text-sm text-foreground">{warning}</p>
              </div>
            ))}
            {discoveryStatus.warnings.length === 0 && engineStatus.warnings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No warnings reported.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latency mode card</CardTitle>
            <CardDescription>Profile emphasis remains mock/config-only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Mode</span>
                <Badge>{engineStatus.latencyMode}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Session control is available from the Apps page. Channel assignment is Audapp-local metadata only and does not route audio.
              </p>
            </div>
            <div className="rounded-md bg-muted/30 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">Active profile focus</span>
              </div>
              <p className="text-sm text-muted-foreground">{activeProfile?.focus}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active applications snapshot</CardTitle>
          <CardDescription>Render sessions discovered from Windows Core Audio.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
              No active audio sessions were discovered. Start playback in an app and refresh.
            </p>
          ) : (
            sessions.map((session) => {
              const volume = sessionVolumePercent(session);
              return (
                <div key={session.id} className="rounded-md bg-muted/20 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-medium">{sessionDisplayLabel(session)}</span>
                    <Badge variant="outline">{session.state}</Badge>
                  </div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>{sessionProcessLabel(session)}</p>
                    {volume !== null ? (
                      <div className="flex items-center justify-between text-foreground">
                        <span>Volume</span>
                        <span>
                          {volume}%{session.muted ? " • muted" : ""}
                        </span>
                      </div>
                    ) : (
                      <p>Volume unavailable for this session.</p>
                    )}
                    {volume !== null ? <Progress value={volume} /> : null}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard title="Discovery source" icon={Activity} value={discoveryStatus.source} />
        <MetricCard title="Engine scope" icon={Waves} value="Routing/DSP mock only" />
      </div>
    </div>
  );
}

function DeviceCard({
  icon: Icon,
  title,
  name,
  detail,
}: {
  icon: typeof MonitorSpeaker;
  title: string;
  name: string;
  detail: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Default endpoint from Windows multimedia role.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Icon className="size-4 text-muted-foreground" />
        <div>
          <p className="font-medium text-foreground">{name}</p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({
  title,
  icon: Icon,
  value,
}: {
  title: string;
  icon: typeof Activity;
  value: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{value}</span>
        <Icon className="size-4 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}
