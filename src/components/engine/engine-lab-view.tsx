import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { useAudioEngine } from "@/lib/use-audio-engine";
import { useAudioDsp } from "@/lib/use-audio-dsp";
import type { AudioDiscoveryDevice } from "@/types/discovery";
import type { AudioEngineMode } from "@/types/audio-engine";

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

function stateColor(state: string) {
  switch (state) {
    case "running": return "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30";
    case "starting":
    case "stopping": return "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30";
    case "error": return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

export function EngineLabView({ outputDevices, inputDevices }: EngineLabViewProps) {
  const { status, isLoading, error: engineError, start, stop, refresh } = useAudioEngine();
  const dsp = useAudioDsp();

  const [selectedOutputId, setSelectedOutputId] = useState<string>("");
  const [selectedInputId, setSelectedInputId] = useState<string>("");
  const [selectedMode, setSelectedMode] = useState<Exclude<AudioEngineMode, "none">>("render_silence");
  const [toneFrequency, setToneFrequency] = useState(440);
  const [toneGain, setToneGain] = useState(0.1);

  const isRunning = status.state === "running" || status.state === "starting";
  const isCaptureMode = selectedMode === "capture_meter" || selectedMode === "capture_to_null";
  const isCaptureModeActive = status.mode === "capture_meter" || status.mode === "capture_to_null";
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

  return (
    <div className="max-w-2xl space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold">Audio Engine Lab</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Test-only WASAPI streams. Does not process app audio, routing, or system output.
        </p>
      </div>

      {/* Test Setup */}
      <section className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Test Setup</p>
        <div className="rounded-md border border-border divide-y divide-border">
          {/* Output device */}
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-28 shrink-0 text-sm text-muted-foreground">Output</span>
            <Select value={selectedOutputId} onValueChange={setSelectedOutputId}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder={outputDevices.length > 0 ? "Default" : "None"} />
              </SelectTrigger>
              <SelectContent>
                {outputDevices.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}{d.isDefault ? " (default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Input device */}
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-28 shrink-0 text-sm text-muted-foreground">Input</span>
            <Select value={selectedInputId} onValueChange={setSelectedInputId} disabled={!isCaptureMode}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder={inputDevices.length > 0 ? "Default" : "None"} />
              </SelectTrigger>
              <SelectContent>
                {inputDevices.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}{d.isDefault ? " (default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Mode */}
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-28 shrink-0 text-sm text-muted-foreground">Mode</span>
            <Select
              value={selectedMode}
              onValueChange={(v) => setSelectedMode(v as Exclude<AudioEngineMode, "none">)}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tone params */}
          {isToneMode && (
            <>
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="w-28 shrink-0 text-sm text-muted-foreground">Frequency</span>
                <div className="flex flex-1 items-center gap-3">
                  <Slider
                    min={100} max={2000} step={10}
                    value={[toneFrequency]}
                    onValueChange={([v]) => setToneFrequency(v ?? toneFrequency)}
                    className="flex-1"
                  />
                  <span className="w-16 text-right text-sm tabular-nums text-muted-foreground">{toneFrequency} Hz</span>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="w-28 shrink-0 text-sm text-muted-foreground">Gain</span>
                <div className="flex flex-1 items-center gap-3">
                  <Slider
                    min={0.01} max={0.5} step={0.01}
                    value={[toneGain]}
                    onValueChange={([v]) => setToneGain(v ?? toneGain)}
                    className="flex-1"
                  />
                  <span className="w-16 text-right text-sm tabular-nums text-muted-foreground">{toneGain.toFixed(2)}</span>
                </div>
              </div>
            </>
          )}

          {/* Start / Stop */}
          <div className="flex items-center gap-2 px-4 py-3">
            <Button onClick={handleStart} disabled={isRunning || isLoading} size="sm" className="w-20">
              Start
            </Button>
            <Button
              variant="outline"
              onClick={() => void stop()}
              disabled={!isRunning || isLoading}
              size="sm"
              className="w-20"
            >
              Stop
            </Button>
            <Button variant="ghost" size="icon" className="size-8 ml-1" onClick={() => void refresh()} disabled={isLoading}>
              ↻
            </Button>
            {engineError && <p className="text-xs text-destructive">{engineError}</p>}
          </div>
        </div>
      </section>

      {/* Runtime Status */}
      <section className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Engine Status</p>
        <div className="rounded-md border border-border divide-y divide-border">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-28 shrink-0 text-sm text-muted-foreground">State</span>
            <Badge variant="outline" className={cn("text-xs", stateColor(status.state))}>
              {status.state}
            </Badge>
            {status.mode !== "none" && (
              <span className="text-xs text-muted-foreground">{status.mode.replace(/_/g, " ")}</span>
            )}
          </div>

          {status.sampleRate && (
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="w-28 shrink-0 text-sm text-muted-foreground">Format</span>
              <span className="text-sm tabular-nums">
                {status.sampleRate / 1000} kHz · {status.channels}ch · {status.bitsPerSample}-bit
              </span>
            </div>
          )}

          {status.bufferFrames != null && status.estimatedLatencyMs != null && (
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="w-28 shrink-0 text-sm text-muted-foreground">Latency</span>
              <span className="text-sm tabular-nums">
                {status.bufferFrames} frames · {status.estimatedLatencyMs.toFixed(1)} ms
              </span>
            </div>
          )}

          {status.glitchCount > 0 && (
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="w-28 shrink-0 text-sm text-muted-foreground">Glitches</span>
              <span className="text-sm tabular-nums text-yellow-600 dark:text-yellow-400">
                {status.glitchCount}
              </span>
            </div>
          )}

          {isCaptureModeActive && status.state === "running" && (
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm text-muted-foreground">Peak</span>
                <Progress value={(status.peakLevel ?? 0) * 100} className="flex-1 h-1.5" />
                <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                  {status.peakLevel !== null ? `${(status.peakLevel * 100).toFixed(1)}%` : "—"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm text-muted-foreground">RMS</span>
                <Progress value={(status.rmsLevel ?? 0) * 100} className="flex-1 h-1.5" />
                <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                  {status.rmsLevel !== null ? `${(status.rmsLevel * 100).toFixed(1)}%` : "—"}
                </span>
              </div>
            </div>
          )}

          {status.warning && (
            <div className="px-4 py-3">
              <p className="text-xs text-yellow-600 dark:text-yellow-400">{status.warning}</p>
            </div>
          )}

          {status.lastError && (
            <div className="px-4 py-3">
              <p className="text-xs text-destructive">{status.lastError}</p>
            </div>
          )}
        </div>
      </section>

      {/* DSP / EQ Test */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">DSP / EQ Test</p>
          {dsp.status && (
            <Badge
              variant="outline"
              className={cn("text-xs", dsp.status.supported
                ? dsp.status.enabled && dsp.status.activeInEngine
                  ? "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30"
                  : "bg-muted text-muted-foreground border-border"
                : "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30"
              )}
            >
              {!dsp.status.supported ? "unsupported" : dsp.status.enabled && dsp.status.activeInEngine ? "active" : "disabled"}
            </Badge>
          )}
        </div>

        <div className="rounded-md border border-border divide-y divide-border">
          {/* Enable DSP */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">Enable DSP</span>
            <Switch
              checked={dsp.config.enabled}
              onCheckedChange={(checked) => void dsp.commitConfig({ ...dsp.config, enabled: checked })}
              disabled={dsp.isLoading}
            />
          </div>

          {/* Output gain */}
          <SliderRow
            label="Output gain"
            value={`${dsp.config.outputGainDb > 0 ? "+" : ""}${dsp.config.outputGainDb.toFixed(1)} dB`}
            min={-24} max={12} step={0.5}
            sliderValue={[dsp.config.outputGainDb]}
            disabled={!dsp.config.enabled || dsp.isLoading}
            onValueChange={([v]) => { if (v !== undefined) dsp.setConfig({ ...dsp.config, outputGainDb: v }); }}
            onValueCommit={([v]) => { if (v !== undefined) void dsp.commitConfig({ ...dsp.config, outputGainDb: v }); }}
          />

          {/* Input gain */}
          <SliderRow
            label="Input gain"
            value={`${dsp.config.inputGainDb > 0 ? "+" : ""}${dsp.config.inputGainDb.toFixed(1)} dB`}
            min={-24} max={12} step={0.5}
            sliderValue={[dsp.config.inputGainDb]}
            disabled={!dsp.config.enabled || dsp.isLoading}
            onValueChange={([v]) => { if (v !== undefined) dsp.setConfig({ ...dsp.config, inputGainDb: v }); }}
            onValueCommit={([v]) => { if (v !== undefined) void dsp.commitConfig({ ...dsp.config, inputGainDb: v }); }}
          />

          {/* HPF */}
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-28 shrink-0 text-sm text-muted-foreground">High-Pass</span>
            <Switch
              size="sm"
              checked={dsp.config.highPassEnabled}
              disabled={!dsp.config.enabled || dsp.isLoading}
              onCheckedChange={(checked) => void dsp.commitConfig({ ...dsp.config, highPassEnabled: checked })}
            />
            <div className="flex flex-1 items-center gap-3">
              <Slider
                min={20} max={300} step={1}
                value={[dsp.config.highPassHz]}
                disabled={!dsp.config.enabled || !dsp.config.highPassEnabled || dsp.isLoading}
                onValueChange={([v]) => { if (v !== undefined) dsp.setConfig({ ...dsp.config, highPassHz: v }); }}
                onValueCommit={([v]) => { if (v !== undefined) void dsp.commitConfig({ ...dsp.config, highPassHz: v }); }}
              />
              <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                {dsp.config.highPassHz.toFixed(0)} Hz
              </span>
            </div>
          </div>

          {/* LPF */}
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-28 shrink-0 text-sm text-muted-foreground">Low-Pass</span>
            <Switch
              size="sm"
              checked={dsp.config.lowPassEnabled}
              disabled={!dsp.config.enabled || dsp.isLoading}
              onCheckedChange={(checked) => void dsp.commitConfig({ ...dsp.config, lowPassEnabled: checked })}
            />
            <div className="flex flex-1 items-center gap-3">
              <Slider
                min={4000} max={20000} step={100}
                value={[dsp.config.lowPassHz]}
                disabled={!dsp.config.enabled || !dsp.config.lowPassEnabled || dsp.isLoading}
                onValueChange={([v]) => { if (v !== undefined) dsp.setConfig({ ...dsp.config, lowPassHz: v }); }}
                onValueCommit={([v]) => { if (v !== undefined) void dsp.commitConfig({ ...dsp.config, lowPassHz: v }); }}
              />
              <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                {(dsp.config.lowPassHz / 1000).toFixed(1)} kHz
              </span>
            </div>
          </div>

          {/* EQ Enable */}
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm">EQ Bands</span>
            <Switch
              size="sm"
              checked={dsp.config.eqEnabled}
              disabled={!dsp.config.enabled || dsp.isLoading}
              onCheckedChange={(checked) => void dsp.commitConfig({ ...dsp.config, eqEnabled: checked })}
            />
          </div>

          {/* EQ band sliders */}
          {dsp.config.eqBands.length > 0 && (
            <div className="px-4 py-3">
              <div className="grid grid-cols-5 gap-3">
                {dsp.config.eqBands.map((band, idx) => {
                  const label = band.frequencyHz >= 1000
                    ? `${band.frequencyHz / 1000}k`
                    : `${band.frequencyHz}`;
                  return (
                    <div key={band.id} className="flex flex-col items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">{label}</span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {band.gainDb > 0 ? "+" : ""}{band.gainDb.toFixed(1)}
                      </span>
                      <Slider
                        min={-12} max={12} step={0.5}
                        value={[band.gainDb]}
                        disabled={!dsp.config.enabled || !dsp.config.eqEnabled || dsp.isLoading}
                        orientation="vertical"
                        className="h-16"
                        onValueChange={([v]) => {
                          if (v === undefined) return;
                          const newBands = dsp.config.eqBands.map((b, i) => i === idx ? { ...b, gainDb: v } : b);
                          dsp.setConfig({ ...dsp.config, eqBands: newBands });
                        }}
                        onValueCommit={([v]) => {
                          if (v === undefined) return;
                          const newBands = dsp.config.eqBands.map((b, i) => i === idx ? { ...b, gainDb: v } : b);
                          void dsp.commitConfig({ ...dsp.config, eqBands: newBands });
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Reset + errors */}
          <div className="flex items-center gap-3 px-4 py-3">
            <Button variant="outline" size="sm" onClick={() => void dsp.reset()} disabled={dsp.isLoading}>
              Reset to flat
            </Button>
            {dsp.status?.unsupportedReason && (
              <p className="text-xs text-yellow-600 dark:text-yellow-400">{dsp.status.unsupportedReason}</p>
            )}
            {dsp.error && <p className="text-xs text-destructive">{dsp.error}</p>}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          DSP and EQ apply only to Engine Lab streams. They do not affect app audio, channel routing, microphone enhancement, or system output.
        </p>
      </section>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  sliderValue,
  disabled,
  onValueChange,
  onValueCommit,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  sliderValue: number[];
  disabled: boolean;
  onValueChange: (values: number[]) => void;
  onValueCommit: (values: number[]) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="w-28 shrink-0 text-sm text-muted-foreground">{label}</span>
      <Slider
        min={min} max={max} step={step}
        value={sliderValue}
        disabled={disabled}
        onValueChange={onValueChange}
        onValueCommit={onValueCommit}
        className="flex-1"
      />
      <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">{value}</span>
    </div>
  );
}
