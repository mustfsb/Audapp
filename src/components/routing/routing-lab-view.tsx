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
import { cn } from "@/lib/utils";
import { useAudioRouting } from "@/lib/use-audio-routing";
import type { AudioDiscoveryDevice } from "@/types/discovery";

interface RoutingLabViewProps {
  outputDevices: AudioDiscoveryDevice[];
  inputDevices: AudioDiscoveryDevice[];
}

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

export function RoutingLabView({ outputDevices, inputDevices }: RoutingLabViewProps) {
  const { status, isLoading, error, start, stop, refresh } = useAudioRouting();

  const [captureDeviceId, setCaptureDeviceId] = useState("");
  const [renderDeviceId, setRenderDeviceId] = useState("");

  const isRunning = status.state === "running" || status.state === "starting";
  const peakPercent = status.peakLevel != null ? Math.min(100, status.peakLevel * 100) : 0;
  const rmsPercent = status.rmsLevel != null ? Math.min(100, status.rmsLevel * 100) : 0;

  function handleStart() {
    if (!captureDeviceId || !renderDeviceId) {
      return;
    }
    void start({
      captureDeviceId,
      renderDeviceId,
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Routing Lab</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Experimental manual routing — capture / virtual input → DSP/EQ → output.
        </p>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Routing Lab is experimental.</p>
        <p className="mt-1">
          It processes audio from a selected capture / virtual-input device and sends it to a
          selected output, applying your Equalizer/DSP settings. It does not automatically route
          app audio yet.
        </p>
        <p className="mt-1">
          Use a virtual cable or Voicemeeter to send an app into Audapp, then pick that cable as
          the capture device here.
        </p>
      </div>

      <section className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground">Devices</p>
        <div className="rounded-xl bg-card divide-y divide-border/50">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-36 shrink-0 text-sm text-muted-foreground">Capture / virtual in</span>
            <Select value={captureDeviceId} onValueChange={setCaptureDeviceId} disabled={isRunning}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder={inputDevices.length > 0 ? "Select input" : "None"} />
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

          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-36 shrink-0 text-sm text-muted-foreground">Output</span>
            <Select value={renderDeviceId} onValueChange={setRenderDeviceId} disabled={isRunning}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder={outputDevices.length > 0 ? "Select output" : "None"} />
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
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleStart} disabled={isRunning || isLoading || !captureDeviceId || !renderDeviceId}>
          Start routing
        </Button>
        <Button variant="outline" onClick={() => void stop()} disabled={!isRunning || isLoading}>
          Stop routing
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void refresh()}>
          Refresh status
        </Button>
      </div>

      {(error || status.lastError) && (
        <p className="text-sm text-destructive">{error ?? status.lastError}</p>
      )}

      {status.warning && (
        <p className="text-sm text-amber-700 dark:text-amber-400">{status.warning}</p>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground">Runtime</p>
          <Badge variant="outline" className={cn("text-xs", stateColor(status.state))}>
            {status.state}
          </Badge>
        </div>

        <div className="rounded-xl bg-card divide-y divide-border/50 text-sm">
          <StatusRow label="Sample rate" value={status.sampleRate ? `${status.sampleRate} Hz` : "—"} />
          <StatusRow
            label="Channels"
            value={
              status.inputChannels != null && status.outputChannels != null
                ? `${status.inputChannels} in → ${status.outputChannels} out`
                : "—"
            }
          />
          <StatusRow
            label="Est. latency"
            value={
              status.estimatedLatencyMs != null
                ? `${status.estimatedLatencyMs.toFixed(1)} ms`
                : "—"
            }
          />
          <StatusRow
            label="Ring fill"
            value={
              status.ringFillPercent != null
                ? `${status.ringFillPercent.toFixed(1)}%`
                : "—"
            }
          />
          <StatusRow label="Underruns" value={String(status.underrunCount)} />
          <StatusRow label="Overruns" value={String(status.overrunCount)} />
          <StatusRow label="Glitches" value={String(status.glitchCount)} />
        </div>

        {isRunning && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Output level (post-DSP)</p>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Peak</span>
                <span>{peakPercent.toFixed(0)}%</span>
              </div>
              <Progress value={peakPercent} className="h-2" />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>RMS</span>
                <span>{rmsPercent.toFixed(0)}%</span>
              </div>
              <Progress value={rmsPercent} className="h-2" />
            </div>
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Equalizer and DSP settings on the Equalizer page affect Routing Lab audio while routing is
        running. This is not system-wide EQ and does not move app audio automatically.
      </p>
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}
