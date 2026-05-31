import { useState } from "react";

import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useAudioEngine } from "@/lib/use-audio-engine";
import { useAudioDsp } from "@/lib/use-audio-dsp";
import type { AudioDiscoveryDevice } from "@/types/discovery";
import type { AudioEngineMode, DspRuntimeConfig } from "@/types/audio-engine";

interface EngineLabViewProps {
  outputDevices: AudioDiscoveryDevice[];
  inputDevices: AudioDiscoveryDevice[];
}

const MODE_OPTIONS: { value: Exclude<AudioEngineMode, "none">; label: string }[] = [
  { value: "render_silence", label: "Render Silence" },
  { value: "render_test_tone", label: "Render Test Tone" },
  { value: "capture_meter", label: "Capture Meter" },
  { value: "capture_to_null", label: "Capture to Null" },
];

function stateColor(state: string): string {
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

function dspStatusBadge(
  enabled: boolean,
  active: boolean,
  supported: boolean,
): { label: string; className: string } {
  if (!supported)
    return {
      label: "unsupported",
      className: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
    };
  if (enabled && active)
    return {
      label: "active",
      className: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
    };
  return { label: "disabled", className: "bg-muted text-muted-foreground border-border" };
}

export function EngineLabView({ outputDevices, inputDevices }: EngineLabViewProps) {
  const { status, isLoading, error, start, stop, refresh } = useAudioEngine();
  const dsp = useAudioDsp();

  const [selectedOutputId, setSelectedOutputId] = useState<string>("");
  const [selectedInputId, setSelectedInputId] = useState<string>("");
  const [selectedMode, setSelectedMode] = useState<Exclude<AudioEngineMode, "none">>(
    "render_silence",
  );
  const [toneFrequency, setToneFrequency] = useState(440);
  const [toneGain, setToneGain] = useState(0.1);

  const isRunning = status.state === "running" || status.state === "starting";
  const isCaptureMode =
    selectedMode === "capture_meter" || selectedMode === "capture_to_null";
  const isCaptureModeActive =
    status.mode === "capture_meter" || status.mode === "capture_to_null";
  const isToneMode = selectedMode === "render_test_tone";

  function handleStart() {
    void start({
      mode: selectedMode,
      outputDeviceId: selectedOutputId || null,
      inputDeviceId: selectedInputId || null,
      toneFrequencyHz: isToneMode ? toneFrequency : null,
      toneGain: isToneMode ? toneGain : null,
    });
  }

  const defaultOutputLabel = outputDevices.length > 0 ? "Default output" : "No output devices";
  const defaultInputLabel = inputDevices.length > 0 ? "Default input" : "No input devices";

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        eyebrow="Audio Engine"
        title="Audio Engine Lab"
        description="Manual WASAPI stream test bench — start, monitor, and stop shared-mode render and capture streams."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Controls card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stream Controls</CardTitle>
            <CardDescription>Select device and mode, then start the engine.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Output Device</label>
              <Select value={selectedOutputId} onValueChange={setSelectedOutputId}>
                <SelectTrigger>
                  <SelectValue placeholder={defaultOutputLabel} />
                </SelectTrigger>
                <SelectContent>
                  {outputDevices.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                      {d.isDefault ? " (default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Input Device</label>
              <Select
                value={selectedInputId}
                onValueChange={setSelectedInputId}
                disabled={!isCaptureMode}
              >
                <SelectTrigger>
                  <SelectValue placeholder={defaultInputLabel} />
                </SelectTrigger>
                <SelectContent>
                  {inputDevices.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                      {d.isDefault ? " (default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Mode</label>
              <Select
                value={selectedMode}
                onValueChange={(v) => setSelectedMode(v as Exclude<AudioEngineMode, "none">)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isToneMode && (
              <>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">
                      Tone Frequency
                    </label>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {toneFrequency} Hz
                    </span>
                  </div>
                  <Slider
                    min={100}
                    max={2000}
                    step={10}
                    value={[toneFrequency]}
                    onValueChange={([v]) => setToneFrequency(v ?? toneFrequency)}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">
                      Tone Gain
                    </label>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {toneGain.toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    min={0.01}
                    max={0.5}
                    step={0.01}
                    value={[toneGain]}
                    onValueChange={([v]) => setToneGain(v ?? toneGain)}
                  />
                </div>
              </>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                onClick={handleStart}
                disabled={isRunning || isLoading}
                className="flex-1"
              >
                Start
              </Button>
              <Button
                variant="outline"
                onClick={() => void stop()}
                disabled={!isRunning || isLoading}
                className="flex-1"
              >
                Stop
              </Button>
              <Button variant="ghost" size="icon" onClick={() => void refresh()} disabled={isLoading}>
                ↻
              </Button>
            </div>

            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
          </CardContent>
        </Card>

        {/* Status card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Engine Status</CardTitle>
            <CardDescription>Real-time WASAPI stream state.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">State</span>
              <Badge
                variant="outline"
                className={stateColor(status.state)}
              >
                {status.state}
              </Badge>
            </div>

            {status.mode !== "none" && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Mode</span>
                <span className="text-xs">{status.mode.replace(/_/g, " ")}</span>
              </div>
            )}

            {status.sampleRate && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Format</span>
                <span className="text-xs tabular-nums">
                  {status.sampleRate / 1000} kHz / {status.channels}ch /{" "}
                  {status.bitsPerSample}-bit
                </span>
              </div>
            )}

            {status.bufferFrames && status.estimatedLatencyMs !== null && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Latency</span>
                <span className="text-xs tabular-nums">
                  {status.bufferFrames} frames · {status.estimatedLatencyMs.toFixed(1)} ms
                </span>
              </div>
            )}

            {status.glitchCount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Glitches</span>
                <span className="text-xs tabular-nums text-yellow-600 dark:text-yellow-400">
                  {status.glitchCount}
                </span>
              </div>
            )}

            {isCaptureModeActive && status.state === "running" && (
              <>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Peak</span>
                    <span className="text-xs tabular-nums">
                      {status.peakLevel !== null
                        ? `${(status.peakLevel * 100).toFixed(1)}%`
                        : "—"}
                    </span>
                  </div>
                  <Progress value={(status.peakLevel ?? 0) * 100} className="h-1.5" />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">RMS</span>
                    <span className="text-xs tabular-nums">
                      {status.rmsLevel !== null
                        ? `${(status.rmsLevel * 100).toFixed(1)}%`
                        : "—"}
                    </span>
                  </div>
                  <Progress value={(status.rmsLevel ?? 0) * 100} className="h-1.5" />
                </div>
              </>
            )}

            {status.warning && (
              <p className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-600 dark:text-yellow-400">
                {status.warning}
              </p>
            )}

            {status.lastError && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
                {status.lastError}
              </p>
            )}

            <p className="mt-1 rounded-md border border-border bg-muted/50 p-2 text-xs text-muted-foreground">
              Audio Engine Lab is for testing only. It does not route app audio yet. EQ and noise
              suppression are not active yet.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* DSP / EQ Test card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">DSP / EQ Test</CardTitle>
              <CardDescription>
                Test-only gain and filter processing for Engine Lab streams only.
              </CardDescription>
            </div>
            {dsp.status && (() => {
              const badge = dspStatusBadge(
                dsp.status.enabled,
                dsp.status.activeInEngine,
                dsp.status.supported,
              );
              return (
                <Badge variant="outline" className={badge.className}>
                  {badge.label}
                </Badge>
              );
            })()}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Enable DSP</label>
            <Switch
              checked={dsp.config.enabled}
              onCheckedChange={(checked) => {
                const next: DspRuntimeConfig = { ...dsp.config, enabled: checked };
                void dsp.commitConfig(next);
              }}
              disabled={dsp.isLoading}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Output Gain</label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {dsp.config.outputGainDb > 0 ? "+" : ""}
                  {dsp.config.outputGainDb.toFixed(1)} dB
                </span>
              </div>
              <Slider
                min={-24}
                max={12}
                step={0.5}
                value={[dsp.config.outputGainDb]}
                disabled={!dsp.config.enabled || dsp.isLoading}
                onValueChange={([v]) => {
                  if (v !== undefined) dsp.setConfig({ ...dsp.config, outputGainDb: v });
                }}
                onValueCommit={([v]) => {
                  if (v !== undefined) void dsp.commitConfig({ ...dsp.config, outputGainDb: v });
                }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Input Gain</label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {dsp.config.inputGainDb > 0 ? "+" : ""}
                  {dsp.config.inputGainDb.toFixed(1)} dB
                </span>
              </div>
              <Slider
                min={-24}
                max={12}
                step={0.5}
                value={[dsp.config.inputGainDb]}
                disabled={!dsp.config.enabled || dsp.isLoading}
                onValueChange={([v]) => {
                  if (v !== undefined) dsp.setConfig({ ...dsp.config, inputGainDb: v });
                }}
                onValueCommit={([v]) => {
                  if (v !== undefined) void dsp.commitConfig({ ...dsp.config, inputGainDb: v });
                }}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">High-Pass Filter</label>
                <Switch
                  size="sm"
                  checked={dsp.config.highPassEnabled}
                  disabled={!dsp.config.enabled || dsp.isLoading}
                  onCheckedChange={(checked) => {
                    void dsp.commitConfig({ ...dsp.config, highPassEnabled: checked });
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Cutoff</span>
                <span className="tabular-nums">{dsp.config.highPassHz.toFixed(0)} Hz</span>
              </div>
              <Slider
                min={20}
                max={300}
                step={1}
                value={[dsp.config.highPassHz]}
                disabled={!dsp.config.enabled || !dsp.config.highPassEnabled || dsp.isLoading}
                onValueChange={([v]) => {
                  if (v !== undefined) dsp.setConfig({ ...dsp.config, highPassHz: v });
                }}
                onValueCommit={([v]) => {
                  if (v !== undefined) void dsp.commitConfig({ ...dsp.config, highPassHz: v });
                }}
              />
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Low-Pass Filter</label>
                <Switch
                  size="sm"
                  checked={dsp.config.lowPassEnabled}
                  disabled={!dsp.config.enabled || dsp.isLoading}
                  onCheckedChange={(checked) => {
                    void dsp.commitConfig({ ...dsp.config, lowPassEnabled: checked });
                  }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Cutoff</span>
                <span className="tabular-nums">{dsp.config.lowPassHz.toFixed(0)} Hz</span>
              </div>
              <Slider
                min={4000}
                max={20000}
                step={100}
                value={[dsp.config.lowPassHz]}
                disabled={!dsp.config.enabled || !dsp.config.lowPassEnabled || dsp.isLoading}
                onValueChange={([v]) => {
                  if (v !== undefined) dsp.setConfig({ ...dsp.config, lowPassHz: v });
                }}
                onValueCommit={([v]) => {
                  if (v !== undefined) void dsp.commitConfig({ ...dsp.config, lowPassHz: v });
                }}
              />
            </div>
          </div>

          {/* EQ Bands */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">EQ Bands</label>
              <Switch
                size="sm"
                checked={dsp.config.eqEnabled}
                disabled={!dsp.config.enabled || dsp.isLoading}
                onCheckedChange={(checked) => {
                  void dsp.commitConfig({ ...dsp.config, eqEnabled: checked });
                }}
              />
            </div>

            <div className="grid grid-cols-5 gap-3">
              {dsp.config.eqBands.map((band, idx) => {
                const label =
                  band.frequencyHz >= 1000
                    ? `${band.frequencyHz / 1000} kHz`
                    : `${band.frequencyHz} Hz`;
                return (
                  <div key={band.id} className="flex flex-col items-center gap-2">
                    <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {band.gainDb > 0 ? "+" : ""}
                      {band.gainDb.toFixed(1)}
                    </span>
                    <Slider
                      min={-12}
                      max={12}
                      step={0.5}
                      value={[band.gainDb]}
                      disabled={!dsp.config.enabled || !dsp.config.eqEnabled || dsp.isLoading}
                      orientation="vertical"
                      className="h-20"
                      onValueChange={([v]) => {
                        if (v === undefined) return;
                        const newBands = dsp.config.eqBands.map((b, i) =>
                          i === idx ? { ...b, gainDb: v } : b,
                        );
                        dsp.setConfig({ ...dsp.config, eqBands: newBands });
                      }}
                      onValueCommit={([v]) => {
                        if (v === undefined) return;
                        const newBands = dsp.config.eqBands.map((b, i) =>
                          i === idx ? { ...b, gainDb: v } : b,
                        );
                        void dsp.commitConfig({ ...dsp.config, eqBands: newBands });
                      }}
                    />
                  </div>
                );
              })}
            </div>

            <p className="rounded-md border border-border bg-muted/50 p-2 text-xs text-muted-foreground">
              EQ bands are test-only and apply only to Audio Engine Lab streams. They do not process
              app audio, routed channels, microphone enhancement, or system output yet.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void dsp.reset()}
              disabled={dsp.isLoading}
            >
              Reset to flat
            </Button>
            {dsp.status?.unsupportedReason && (
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                {dsp.status.unsupportedReason}
              </p>
            )}
            {dsp.error && (
              <p className="text-xs text-destructive">{dsp.error}</p>
            )}
          </div>

          <p className="rounded-md border border-border bg-muted/50 p-2 text-xs text-muted-foreground">
            DSP is test-only and applies only to Audio Engine Lab streams. It does not process app
            audio, channel routing, or system output yet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
