import { Mic2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useVoiceLab } from "@/lib/use-voice-lab";
import { cn } from "@/lib/utils";
import type { VoiceDevice, VoiceLabSettings } from "@/types/voice-lab";

function stateColor(state: string) {
  switch (state) {
    case "running":
      return "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30";
    case "starting":
    case "stopping":
      return "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30";
    case "error":
      return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function MeterRow({ label, peak, rms }: { label: string; peak: number; rms: number }) {
  const peakPct = Math.min(100, peak * 100);
  const rmsPct = Math.min(100, rms * 100);
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Peak</span>
          <span>{peakPct.toFixed(0)}%</span>
        </div>
        <Progress value={peakPct} className="h-1.5" />
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>RMS</span>
          <span>{rmsPct.toFixed(0)}%</span>
        </div>
        <Progress value={rmsPct} className="h-1.5" />
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  displayValue,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  displayValue: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 shrink-0 text-sm text-muted-foreground">{label}</span>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(vals) => onChange(vals[0] ?? value)}
        className="flex-1"
        disabled={disabled}
      />
      <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
        {displayValue}
      </span>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <div>
        <p className="text-sm">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </label>
  );
}

function DeviceSelector({
  label,
  devices,
  selectedId,
  onSelect,
  disabled,
  emptyLabel,
}: {
  label: string;
  devices: VoiceDevice[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  disabled?: boolean;
  emptyLabel: string;
}) {
  if (devices.length === 0) {
    return (
      <div className="flex items-center gap-3">
        <span className="w-36 shrink-0 text-sm text-muted-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{emptyLabel}</span>
      </div>
    );
  }

  const effectiveId = selectedId ?? devices.find((d) => d.isDefault)?.id ?? devices[0]?.id ?? null;

  return (
    <div className="space-y-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="rounded-lg bg-muted/40 divide-y divide-border/50">
        {devices.map((dev) => (
          <label key={dev.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer">
            <input
              type="radio"
              name={label}
              value={dev.id}
              checked={effectiveId === dev.id}
              onChange={() => onSelect(dev.id)}
              disabled={disabled}
              className="shrink-0"
            />
            <span className="text-sm flex-1">{dev.name}</span>
            {dev.isDefault && (
              <Badge variant="outline" className="text-xs">
                Default
              </Badge>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

export function NoiseView() {
  const {
    status,
    inputDevices,
    outputDevices,
    settings,
    setSettings,
    isLoading,
    error,
    start,
    stop,
    refresh,
    reloadDevices,
  } = useVoiceLab();

  const isRunning = status.state === "running" || status.state === "starting";

  function patch(delta: Partial<VoiceLabSettings>) {
    void setSettings({ ...settings, ...delta });
  }

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Noise Suppression</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Microphone capture and voice processing.
        </p>
      </div>

      {/* Honest status callout */}
      <div className="flex items-start gap-2.5 rounded-xl bg-muted/40 px-4 py-3">
        <Mic2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Preview.</span>{" "}
          This captures and processes mic audio locally. Sending the processed microphone to
          apps (Discord, Teams, Zoom) is coming in a future update.
        </div>
      </div>

      {/* Status + Start/Stop */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold">Capture</CardTitle>
              <Badge
                variant="outline"
                className={cn("text-xs", stateColor(status.state))}
              >
                {status.state}
              </Badge>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => void start()}
                disabled={isRunning || isLoading}
              >
                Start
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void stop()}
                disabled={!isRunning || isLoading}
              >
                Stop
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={refresh}
              >
                <RefreshCw className="size-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {status.inputFormat && (
            <p className="text-xs text-muted-foreground font-mono">{status.inputFormat}</p>
          )}

          {/* Input device selector */}
          <DeviceSelector
            label="Input device"
            devices={inputDevices}
            selectedId={settings.inputDeviceId}
            onSelect={(id) => patch({ inputDeviceId: id })}
            disabled={isRunning}
            emptyLabel="No input devices found"
          />

          {inputDevices.length === 0 && (
            <Button size="sm" variant="ghost" onClick={reloadDevices}>
              Rescan devices
            </Button>
          )}

          {(error ?? status.lastError) && (
            <p className="text-xs text-destructive">{error ?? status.lastError}</p>
          )}
        </CardContent>
      </Card>

      {/* Meters */}
      {isRunning && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-semibold">Meters</CardTitle>
              {settings.gateEnabled && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    status.gateOpen
                      ? "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30"
                      : "bg-muted text-muted-foreground border-border",
                  )}
                >
                  Gate {status.gateOpen ? "open" : "closed"}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <MeterRow label="Raw" peak={status.rawPeak} rms={status.rawRms} />
            <MeterRow
              label="Processed"
              peak={status.processedPeak}
              rms={status.processedRms}
            />
          </CardContent>
        </Card>
      )}

      {/* Processing controls */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Processing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <SliderRow
            label="Input gain"
            value={settings.inputGainDb}
            min={-24}
            max={24}
            step={0.5}
            displayValue={`${settings.inputGainDb > 0 ? "+" : ""}${settings.inputGainDb.toFixed(1)} dB`}
            onChange={(v) => patch({ inputGainDb: v })}
          />

          <div className="space-y-2">
            <ToggleRow
              label="High-pass filter"
              description="Remove low-frequency rumble"
              checked={settings.highPassEnabled}
              onCheckedChange={(v) => patch({ highPassEnabled: v })}
            />
            {settings.highPassEnabled && (
              <SliderRow
                label="HP cutoff"
                value={settings.highPassHz}
                min={40}
                max={400}
                step={5}
                displayValue={`${settings.highPassHz} Hz`}
                onChange={(v) => patch({ highPassHz: v })}
              />
            )}
          </div>

          <div className="space-y-2">
            <ToggleRow
              label="Noise gate"
              description="Silence signal below threshold"
              checked={settings.gateEnabled}
              onCheckedChange={(v) => patch({ gateEnabled: v })}
            />
            {settings.gateEnabled && (
              <>
                <SliderRow
                  label="Gate threshold"
                  value={settings.gateThresholdDb}
                  min={-70}
                  max={-10}
                  step={1}
                  displayValue={`${settings.gateThresholdDb} dB`}
                  onChange={(v) => patch({ gateThresholdDb: v })}
                />
                <SliderRow
                  label="Gate release"
                  value={settings.gateReleaseMs}
                  min={10}
                  max={500}
                  step={10}
                  displayValue={`${settings.gateReleaseMs} ms`}
                  onChange={(v) => patch({ gateReleaseMs: v })}
                />
              </>
            )}
          </div>

          <ToggleRow
            label="Limiter"
            description="Prevent clipping above 0 dBFS"
            checked={settings.limiterEnabled}
            onCheckedChange={(v) => patch({ limiterEnabled: v })}
          />
        </CardContent>
      </Card>

      {/* Monitor output */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Monitor Output</CardTitle>
            <Switch
              checked={settings.monitorEnabled}
              onCheckedChange={(v) => patch({ monitorEnabled: v })}
              disabled={isRunning}
            />
          </div>
        </CardHeader>
        {settings.monitorEnabled && (
          <CardContent className="space-y-4">
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Use headphones to avoid feedback.
            </p>
            <DeviceSelector
              label="Output device"
              devices={outputDevices}
              selectedId={settings.monitorDeviceId}
              onSelect={(id) => patch({ monitorDeviceId: id })}
              disabled={isRunning}
              emptyLabel="No output devices found"
            />
            {status.monitorOutputFormat && (
              <p className="text-xs text-muted-foreground font-mono">
                {status.monitorOutputFormat}
              </p>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
