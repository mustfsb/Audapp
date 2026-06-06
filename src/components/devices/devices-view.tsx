import { Mic2, MonitorSpeaker, RefreshCw } from "lucide-react";

import { AudappChannelsStatus } from "@/components/audapp/audapp-channels-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  audappEndpointBadgeLabel,
  getAudappEndpointClass,
  summarizeAudappChannelEndpoints,
} from "@/lib/audapp-endpoints";
import { statusBadgeVariant } from "@/lib/badge-variant";
import { deviceStateLabel } from "@/lib/discovery-display";
import { cn } from "@/lib/utils";
import type { AudioDiscoveryDevice } from "@/types/discovery";

interface DevicesViewProps {
  devices: AudioDiscoveryDevice[];
  isLoading: boolean;
  onRefresh: () => void;
}

export function DevicesView({ devices, isLoading, onRefresh }: DevicesViewProps) {
  const outputs = devices.filter((d) => d.kind === "output");
  const inputs = devices.filter((d) => d.kind === "input");
  const audappChannelEndpoints = summarizeAudappChannelEndpoints(devices);

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Devices</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Windows audio endpoints discovered via Core Audio.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw className={cn("size-3.5", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <AudappChannelsStatus
        endpoints={audappChannelEndpoints}
        description="Actual Windows AudappChannels endpoints mapped to the four internal Audapp output channels."
      />

      <DeviceGroup title="Output" icon={MonitorSpeaker} devices={outputs} />
      <DeviceGroup title="Input" icon={Mic2} devices={inputs} />
    </div>
  );
}

function AudappEndpointBadge({ device }: { device: AudioDiscoveryDevice }) {
  const endpointClass = getAudappEndpointClass(device);
  const label = audappEndpointBadgeLabel(endpointClass);
  if (!label) {
    return null;
  }

  // Audapp Input and the old multi endpoint are legacy/diagnostic now that the
  // product runs on the four AudappChannels outputs.
  switch (endpointClass.kind) {
    case "channel_output":
      return <Badge variant={statusBadgeVariant("info")}>Audapp {label}</Badge>;
    case "input":
      return <Badge variant={statusBadgeVariant("legacy")}>Legacy</Badge>;
    case "legacy_multi":
      return <Badge variant={statusBadgeVariant("legacy")}>Legacy (stale)</Badge>;
    default:
      return <Badge variant={statusBadgeVariant("neutral")}>Audapp</Badge>;
  }
}

function DeviceGroup({
  title,
  icon: Icon,
  devices,
}: {
  title: string;
  icon: typeof MonitorSpeaker;
  devices: AudioDiscoveryDevice[];
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
      </div>
      {devices.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">No {title.toLowerCase()} devices found.</p>
      ) : (
        <div className="divide-y divide-border/50 rounded-xl bg-card">
          {devices.map((device) => (
            <div key={device.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{device.name}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <AudappEndpointBadge device={device} />
                {device.isDefault && <Badge variant={statusBadgeVariant("info")}>Default</Badge>}
                <Badge
                  variant={statusBadgeVariant(device.state === "active" ? "ok" : "neutral")}
                >
                  {deviceStateLabel(device.state)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
