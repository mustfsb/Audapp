import { Mic2, MonitorSpeaker, RefreshCw } from "lucide-react";

import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deviceStateLabel } from "@/lib/discovery-display";
import type { AudioDiscoveryDevice } from "@/types/discovery";

interface DevicesViewProps {
  devices: AudioDiscoveryDevice[];
  isLoading: boolean;
  onRefresh: () => void;
}

export function DevicesView({ devices, isLoading, onRefresh }: DevicesViewProps) {
  const groups = {
    output: devices.filter((device) => device.kind === "output"),
    input: devices.filter((device) => device.kind === "input"),
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Devices"
        title="Input and output inventory"
        description="Endpoints enumerated from Windows Core Audio. Sample rate, bit depth, and latency are not reported in this phase."
        actions={
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh devices
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <DeviceGroup
          title="Output devices"
          description="Playback endpoints discovered on the system."
          icon={MonitorSpeaker}
          devices={groups.output}
        />
        <DeviceGroup
          title="Input devices"
          description="Capture endpoints discovered on the system."
          icon={Mic2}
          devices={groups.input}
        />
      </div>
    </div>
  );
}

function DeviceGroup({
  title,
  description,
  icon: Icon,
  devices,
}: {
  title: string;
  description: string;
  icon: typeof MonitorSpeaker;
  devices: AudioDiscoveryDevice[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Icon className="size-4 text-muted-foreground" />
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No devices found in this group.</p>
        ) : (
          devices.map((device) => (
            <div key={device.id} className="rounded-md bg-muted/20 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{device.name}</p>
                  <p className="text-sm text-muted-foreground">Endpoint ID hidden in UI</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {device.isDefault ? <Badge>Default</Badge> : null}
                  <Badge variant={device.state === "active" ? "secondary" : "outline"}>
                    {deviceStateLabel(device.state)}
                  </Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Routing, format details, and health metrics are not implemented in Phase 2B.
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
