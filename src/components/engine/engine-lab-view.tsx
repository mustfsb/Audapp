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
import { cn } from "@/lib/utils";
import { DspControls } from "@/components/engine/dsp-controls";
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
        <p className="text-xs font-medium text-muted-foreground">Test Setup</p>
        <div className="rounded-xl bg-card divide-y divide-border/50">
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
        <p className="text-xs font-medium text-muted-foreground">Engine Status</p>
        <div className="rounded-xl bg-card divide-y divide-border/50">
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

      <DspControls dsp={dsp} />
    </div>
  );
}
