import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { AppSettings, EngineStatus, LatencyMode } from "@/types/audio";

interface SettingsViewProps {
  settings: AppSettings;
  engineStatus: EngineStatus;
  appVersion: string;
  developerMode: boolean;
  onToggle: (key: "startupBehavior" | "trayBehavior" | "telemetryEnabled", value: boolean) => void;
  onLatencyModeChange: (value: LatencyMode) => void;
  onToggleDeveloperMode: (value: boolean) => void;
}

export function SettingsView({
  settings,
  engineStatus,
  appVersion,
  developerMode,
  onToggle,
  onLatencyModeChange,
  onToggleDeveloperMode,
}: SettingsViewProps) {
  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Desktop behavior and preferences.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SettingToggle
              title="Launch on startup"
              description="Start Audapp at sign-in."
              checked={settings.startupBehavior}
              onCheckedChange={(value) => onToggle("startupBehavior", value)}
            />
            <Separator />
            <SettingToggle
              title="Minimize to tray"
              description="Keep running in the background."
              checked={settings.trayBehavior}
              onCheckedChange={(value) => onToggle("trayBehavior", value)}
            />
            <Separator />
            <SettingToggle
              title="Telemetry"
              description="Disabled by default."
              checked={settings.telemetryEnabled}
              onCheckedChange={(value) => onToggle("telemetryEnabled", value)}
            />
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Latency mode</p>
              <Select value={settings.latencyMode} onValueChange={(value) => onLatencyModeChange(value as LatencyMode)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ultra Low">Ultra Low</SelectItem>
                  <SelectItem value="Balanced">Balanced</SelectItem>
                  <SelectItem value="Stable">Stable</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">System info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="divide-y divide-border/60">
              <InfoRow label="Driver status" value={settings.driverState} />
              <InfoRow label="Engine state" value={engineStatus.state} />
              <InfoRow label="Version" value={appVersion} />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2.5 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <ShieldCheck className="size-3.5" />
                <span>Telemetry</span>
              </div>
              <Badge variant="secondary" className="text-xs">Disabled</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Advanced</CardTitle>
        </CardHeader>
        <CardContent>
          <SettingToggle
            title="Developer mode"
            description="Show engine, routing, and bridge diagnostics in the sidebar."
            checked={developerMode}
            onCheckedChange={onToggleDeveloperMode}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SettingToggle({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xs font-medium text-foreground">{value}</p>
    </div>
  );
}
