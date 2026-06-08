import { useState } from "react";
import { CircleAlert, Mic2, MonitorSpeaker, MoreHorizontal, RefreshCw } from "lucide-react";

import { AudappChannelsStatus } from "@/components/audapp/audapp-channels-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  audappEndpointBadgeLabel,
  getAudappEndpointClass,
  summarizeAudappChannelEndpoints,
} from "@/lib/audapp-endpoints";
import { statusBadgeVariant } from "@/lib/badge-variant";
import { deviceStateLabel } from "@/lib/discovery-display";
import {
  buildOutputPreferenceViewModel,
  deriveOutputPreferenceStatus,
} from "@/lib/output-device-preferences";
import { useOutputDevicePreferences } from "@/lib/use-output-device-preferences";
import { cn } from "@/lib/utils";
import type { AudioDiscoveryDevice } from "@/types/discovery";

interface DevicesViewProps {
  devices: AudioDiscoveryDevice[];
  isLoading: boolean;
  onRefresh: () => void;
}

type OutputPreferenceSlot = "primary" | "fallback";

export function DevicesView({ devices, isLoading, onRefresh }: DevicesViewProps) {
  const preferences = useOutputDevicePreferences();
  const outputs = devices.filter((device) => device.kind === "output");
  const inputs = devices.filter((device) => device.kind === "input");
  const audappChannelEndpoints = summarizeAudappChannelEndpoints(devices);
  const outputView = buildOutputPreferenceViewModel(outputs, {
    primary: preferences.status.primaryOutput
      ? {
          endpointId: preferences.status.primaryOutput.endpointId,
          name: preferences.status.primaryOutput.name,
        }
      : null,
    fallback: preferences.status.fallbackOutput
      ? {
          endpointId: preferences.status.fallbackOutput.endpointId,
          name: preferences.status.fallbackOutput.name,
        }
      : null,
  });
  const derivedStatus = deriveOutputPreferenceStatus({
    primary: preferences.status.primaryOutput
      ? {
          endpointId: preferences.status.primaryOutput.endpointId,
          name: preferences.status.primaryOutput.name,
        }
      : null,
    fallback: preferences.status.fallbackOutput
      ? {
          endpointId: preferences.status.fallbackOutput.endpointId,
          name: preferences.status.fallbackOutput.name,
        }
      : null,
    resolvedOutputName: preferences.status.resolvedOutputName,
    resolutionReason: preferences.status.resolutionReason,
  });

  return (
    <div className="max-w-3xl space-y-5">
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

      <section className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Output Devices</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Right-click an eligible output or use the action menu to set a startup preference.
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant={statusBadgeVariant("info")}>Primary</Badge>
            <Badge variant={statusBadgeVariant("neutral")}>Fallback</Badge>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <PreferenceSummaryCard
            label="Primary output"
            value={outputView.summary.primaryLabel}
          />
          <PreferenceSummaryCard
            label="Fallback output"
            value={outputView.summary.fallbackLabel}
          />
        </div>

        {(preferences.status.resolutionMessage ?? derivedStatus.message) && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
            <p>{preferences.status.resolutionMessage ?? derivedStatus.message}</p>
          </div>
        )}

        {preferences.error && (
          <p className="mt-3 text-xs text-destructive">{preferences.error}</p>
        )}
      </section>

      <AudappChannelsStatus
        endpoints={audappChannelEndpoints}
        description="Actual Windows AudappChannels endpoints mapped to the four internal Audapp output channels."
      />

      <OutputDeviceGroup
        devices={outputView.devices}
        isBusy={preferences.isLoading}
        onSetPreference={(slot, outputEndpointId) =>
          void preferences.setPreference(slot, outputEndpointId)
        }
        onClearPreference={(slot) => void preferences.clearPreference(slot)}
      />
      <DeviceGroup title="Input" icon={Mic2} devices={inputs} />
    </div>
  );
}

function PreferenceSummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/80 px-3 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium">{value}</p>
    </div>
  );
}

function AudappEndpointBadge({ device }: { device: AudioDiscoveryDevice }) {
  const endpointClass = getAudappEndpointClass(device);
  const label = audappEndpointBadgeLabel(endpointClass);
  if (!label) {
    return null;
  }

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
              <div className="flex shrink-0 items-center gap-2">
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

function OutputDeviceGroup({
  devices,
  isBusy,
  onSetPreference,
  onClearPreference,
}: {
  devices: Array<
    AudioDiscoveryDevice & {
      badge: "Primary" | "Fallback" | null;
      eligible: boolean;
    }
  >;
  isBusy: boolean;
  onSetPreference: (slot: OutputPreferenceSlot, outputEndpointId: string) => void;
  onClearPreference: (slot: OutputPreferenceSlot) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <MonitorSpeaker className="size-3.5 text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground">Output</p>
      </div>
      {devices.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">No output devices found.</p>
      ) : (
        <div className="divide-y divide-border/50 rounded-xl bg-card">
          {devices.map((device) => (
            <OutputDeviceRow
              key={device.id}
              device={device}
              isBusy={isBusy}
              onSetPreference={onSetPreference}
              onClearPreference={onClearPreference}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function OutputDeviceRow({
  device,
  isBusy,
  onSetPreference,
  onClearPreference,
}: {
  device: AudioDiscoveryDevice & { badge: "Primary" | "Fallback" | null; eligible: boolean };
  isBusy: boolean;
  onSetPreference: (slot: OutputPreferenceSlot, outputEndpointId: string) => void;
  onClearPreference: (slot: OutputPreferenceSlot) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isPrimary = device.badge === "Primary";
  const isFallback = device.badge === "Fallback";

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <div
        className="flex items-center gap-3 px-4 py-3"
        onContextMenu={(event) => {
          if (!device.eligible) {
            return;
          }
          event.preventDefault();
          setMenuOpen(true);
        }}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{device.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <AudappEndpointBadge device={device} />
          {device.badge && (
            <Badge variant={statusBadgeVariant(device.badge === "Primary" ? "info" : "neutral")}>
              {device.badge}
            </Badge>
          )}
          {device.isDefault && <Badge variant={statusBadgeVariant("info")}>Default</Badge>}
          <Badge variant={statusBadgeVariant(device.state === "active" ? "ok" : "neutral")}>
            {deviceStateLabel(device.state)}
          </Badge>
          {device.eligible ? (
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                disabled={isBusy}
                aria-label={`Output actions for ${device.name}`}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
          ) : null}
        </div>
      </div>

      {device.eligible ? (
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onSetPreference("primary", device.id)}>
            Set as Primary output
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSetPreference("fallback", device.id)}>
            Set as Fallback output
          </DropdownMenuItem>
          {isPrimary && (
            <DropdownMenuItem onClick={() => onClearPreference("primary")}>
              Clear Primary output
            </DropdownMenuItem>
          )}
          {isFallback && (
            <DropdownMenuItem onClick={() => onClearPreference("fallback")}>
              Clear Fallback output
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      ) : null}
    </DropdownMenu>
  );
}
