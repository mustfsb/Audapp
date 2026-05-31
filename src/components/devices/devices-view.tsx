import { Mic2, MonitorSpeaker, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

      <DeviceGroup title="Output" icon={MonitorSpeaker} devices={outputs} />
      <DeviceGroup title="Input" icon={Mic2} devices={inputs} />
    </div>
  );
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
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      </div>
      {devices.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">No {title.toLowerCase()} devices found.</p>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {devices.map((device) => (
            <div key={device.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{device.name}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {device.isDefault && <Badge className="text-xs h-5 px-1.5">Default</Badge>}
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs h-5 px-1.5",
                    device.state === "active"
                      ? "border-green-500/30 text-green-600 dark:text-green-400"
                      : "text-muted-foreground",
                  )}
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
