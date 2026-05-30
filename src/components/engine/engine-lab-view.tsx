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
import { useAudioEngine } from "@/lib/use-audio-engine";
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

export function EngineLabView({ outputDevices, inputDevices }: EngineLabViewProps) {
  const { status, isLoading, error, start, stop, refresh } = useAudioEngine();

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
    </div>
  );
}
