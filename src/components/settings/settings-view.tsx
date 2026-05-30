import { ShieldCheck } from "lucide-react";

import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  onToggle: (key: "startupBehavior" | "trayBehavior" | "telemetryEnabled", value: boolean) => void;
  onLatencyModeChange: (value: LatencyMode) => void;
}

export function SettingsView({
  settings,
  engineStatus,
  appVersion,
  onToggle,
  onLatencyModeChange,
}: SettingsViewProps) {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Settings"
        title="Desktop behavior and system posture"
        description="Configure startup, tray behavior, latency preference, and product visibility without stretching into backend infrastructure."
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>General behavior</CardTitle>
            <CardDescription>Core app-level preferences for Phase 1.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <SettingToggle
              title="Launch on startup"
              description="Prepare Audapp at sign-in."
              checked={settings.startupBehavior}
              onCheckedChange={(value) => onToggle("startupBehavior", value)}
            />
            <Separator />
            <SettingToggle
              title="Minimize to tray"
              description="Keep the app available without staying foregrounded."
              checked={settings.trayBehavior}
              onCheckedChange={(value) => onToggle("trayBehavior", value)}
            />
            <Separator />
            <SettingToggle
              title="Telemetry"
              description="Disabled by default for the current phase."
              checked={settings.telemetryEnabled}
              onCheckedChange={(value) => onToggle("telemetryEnabled", value)}
            />
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Latency mode</p>
              <Select value={settings.latencyMode} onValueChange={(value) => onLatencyModeChange(value as LatencyMode)}>
                <SelectTrigger>
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
          <CardHeader>
            <CardTitle>System info</CardTitle>
            <CardDescription>Status placeholders exposed clearly for later engine integration.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="divide-y divide-border/60">
              <InfoRow label="Driver status" value={settings.driverState} />
              <InfoRow label="Engine state" value={engineStatus.state} />
              <InfoRow label="App version" value={appVersion} />
            </div>
            <div className="rounded-md bg-muted/25 p-4">
              <div className="mb-2 flex items-center gap-2">
                <ShieldCheck className="size-4 text-muted-foreground" />
                <span className="font-medium text-foreground">Privacy posture</span>
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Telemetry default</span>
                <Badge variant="secondary">Disabled</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
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
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
