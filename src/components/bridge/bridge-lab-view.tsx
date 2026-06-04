import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useAudioBridge } from "@/lib/use-audio-bridge";
import { useRouting } from "@/lib/use-routing";
import type { BridgeMode, BridgePocConfig } from "@/types/bridge";

// Known Phase 13A endpoint IDs — used as fallback if candidates not loaded yet
const AUDAPP_RENDER_ID =
  "{0.0.0.00000000}.{6dee1be1-f344-45e4-aa77-2fb20caac6b9}";
const AUDAPP_CAPTURE_ID =
  "{0.0.1.00000000}.{84bbfd53-05f2-4232-b20b-f8c4237c18d6}";

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

function modeLabel(mode: BridgeMode): string {
  switch (mode) {
    case "passthrough": return "pass-through";
    case "resampled_passthrough": return "resampled pass-through";
    case "format_mismatch": return "format mismatch";
    case "error": return "error";
    default: return "capture only";
  }
}

function modeColor(mode: BridgeMode): string {
  switch (mode) {
    case "passthrough":
      return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30";
    case "resampled_passthrough":
      return "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30";
    case "format_mismatch":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
    case "error":
      return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

function StreamSection({
  title,
  stats,
}: {
  title: string;
  stats: {
    active: boolean;
    initializeOk: boolean;
    startOk: boolean;
    packetsRead: number;
    framesRead: number;
    bytesRead: number;
    silenceCount: number;
    peak: number;
    rms: number;
    lastError: string | null;
  };
}) {
  const peakPct = Math.min(100, stats.peak * 100);
  const rmsPct = Math.min(100, stats.rms * 100);

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <Badge
          variant="outline"
          className={cn(
            "text-xs",
            stats.active
              ? "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30"
              : "bg-muted text-muted-foreground border-border",
          )}
        >
          {stats.active ? "active" : "inactive"}
        </Badge>
      </div>
      <div className="rounded-xl bg-card divide-y divide-border/50 text-sm">
        <Row label="Initialize" value={stats.initializeOk ? "OK" : "—"} />
        <Row label="Start" value={stats.startOk ? "OK" : "—"} />
        <Row label="Packets" value={String(stats.packetsRead)} />
        <Row label="Frames" value={String(stats.framesRead)} />
        <Row label="Bytes" value={stats.bytesRead > 0 ? `${(stats.bytesRead / 1024).toFixed(1)} KB` : "0"} />
        <Row label="Silence/glitch" value={String(stats.silenceCount)} />
        {stats.lastError && (
          <div className="px-4 py-2.5 text-xs text-destructive">{stats.lastError}</div>
        )}
      </div>
      {stats.active && (
        <div className="space-y-1.5">
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
      )}
    </section>
  );
}

export function BridgeLabView() {
  const { status, candidates, isLoading, candidatesLoading, error, start, stop, refresh, fetchCandidates } = useAudioBridge();
  const { status: routing, isLoading: routingLoading, error: routingError, enable: enableRouting, disable: disableRouting } = useRouting();

  const [enableLoopback, setEnableLoopback] = useState(true);
  const [enableCapture, setEnableCapture] = useState(true);
  const [enableMonitor, setEnableMonitor] = useState(false);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const [routingOutputId, setRoutingOutputId] = useState<string | null>(null);

  const isRunning = status.state === "running" || status.state === "starting";

  // Effective endpoint IDs: prefer discovered candidates, fall back to hardcoded Phase 13A IDs
  const renderEndpointId = candidates.audappRender?.id ?? AUDAPP_RENDER_ID;
  const captureEndpointId = candidates.audappCapture?.id ?? AUDAPP_CAPTURE_ID;

  // Effective monitor output: user selection or null (worker will auto-discover non-Audapp)
  const monitorEndpointId = enableMonitor ? (selectedOutputId ?? candidates.physicalOutputs[0]?.id ?? null) : null;

  function handleStart() {
    const config: BridgePocConfig = {
      audappRenderEndpointId: renderEndpointId,
      audappCaptureEndpointId: captureEndpointId,
      monitorOutputEndpointId: monitorEndpointId,
      enableRenderLoopbackCapture: enableLoopback,
      enableCaptureEndpointRead: enableCapture,
      enablePhysicalMonitorOutput: enableMonitor,
    };
    void start(config);
  }

  // Effective routing output: user selection in routing section, or fall back to first candidate
  const effectiveRoutingOutputId = routingOutputId ?? candidates.physicalOutputs[0]?.id ?? null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Bridge Lab</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Phase 17A — One-click system routing + manual bridge POC.
        </p>
      </div>

      {/* ── Routing Control ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground">System Routing</p>
          {routing.routingEnabled && (
            <Badge variant="outline" className="text-xs bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30">
              active
            </Badge>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card divide-y divide-border/50 text-sm">
          <div className="px-4 py-3 space-y-0.5">
            <p className="text-xs text-muted-foreground">Current Windows output</p>
            <p className="font-mono text-xs">{routing.currentDefaultRenderName ?? "—"}</p>
          </div>
          <div className="px-4 py-3 space-y-0.5">
            <p className="text-xs text-muted-foreground">Audapp virtual input</p>
            <p className="font-mono text-xs">{routing.audappRenderName ?? "Not found — driver may not be running"}</p>
          </div>
          {routing.routingEnabled && routing.selectedOutputName && (
            <div className="px-4 py-3 space-y-0.5">
              <p className="text-xs text-muted-foreground">Bridge output</p>
              <p className="font-mono text-xs">{routing.selectedOutputName}</p>
            </div>
          )}
          {routing.previousDefaultRenderName && !routing.routingEnabled && (
            <div className="px-4 py-3 space-y-0.5">
              <p className="text-xs text-muted-foreground">Previous output (restore target)</p>
              <p className="font-mono text-xs">{routing.previousDefaultRenderName}</p>
            </div>
          )}
        </div>

        {/* Physical output selector for routing */}
        {!routing.routingEnabled && candidates.physicalOutputs.length > 0 && (
          <div className="rounded-xl bg-card divide-y divide-border/50">
            <p className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Route to physical output</p>
            {candidates.physicalOutputs.map((out) => (
              <label key={out.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="routing-output"
                  value={out.id}
                  checked={(routingOutputId ?? candidates.physicalOutputs[0]?.id) === out.id}
                  onChange={() => setRoutingOutputId(out.id)}
                  className="shrink-0"
                />
                <span className="text-sm">{out.name}</span>
                {out.isDefault && (
                  <Badge variant="outline" className="text-xs ml-auto">Default</Badge>
                )}
              </label>
            ))}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {!routing.routingEnabled ? (
            <Button
              onClick={() => effectiveRoutingOutputId && void enableRouting(effectiveRoutingOutputId)}
              disabled={routingLoading || !effectiveRoutingOutputId || !routing.audappRenderName}
            >
              Enable Audapp Routing
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => void disableRouting()} disabled={routingLoading}>
              Disable Audapp Routing
            </Button>
          )}
        </div>

        {(routing.lastError ?? routingError) && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
            <p className="font-medium text-destructive">Routing error</p>
            <p className="mt-1 text-muted-foreground text-xs">{routing.lastError ?? routingError}</p>
            {routing.previousDefaultRenderName && (
              <p className="mt-1 text-muted-foreground text-xs">
                Manual recovery: Open Windows Sound settings → set output to <strong>{routing.previousDefaultRenderName}</strong>.
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          System-wide routing only. Per-app routing is not implemented yet.
          Enable sets Windows default output to Hoparlör (Audapp Input) and starts the bridge.
          Disable stops the bridge and restores the previous output.
        </p>
      </section>

      <hr className="border-border/50" />

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Manual bridge POC (advanced)</p>
        <ol className="mt-1 list-decimal list-inside space-y-0.5">
          <li>Use Enable Audapp Routing above, or set Windows output manually to <strong>Hoparlör (Audapp Input)</strong></li>
          <li>Play audio in any app (browser, media player)</li>
          <li>Start Bridge POC — watch render-loopback counters increase</li>
          <li>Stop when done</li>
        </ol>
      </div>

      {/* Discovered endpoints */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Discovered Endpoints</p>
          <Button variant="ghost" size="sm" onClick={() => void fetchCandidates()} disabled={candidatesLoading}>
            {candidatesLoading ? "Scanning…" : "Rescan"}
          </Button>
        </div>
        <div className="rounded-xl bg-card divide-y divide-border/50 text-sm">
          <Row
            label="Audapp render (loopback)"
            value={candidates.audappRender ? candidates.audappRender.name : "Not found"}
          />
          {candidates.audappRender?.isDefault && (
            <div className="px-4 py-1.5 text-xs text-green-600 dark:text-green-400">
              ✓ System default output — apps route here automatically
            </div>
          )}
          <Row
            label="Audapp capture"
            value={candidates.audappCapture ? candidates.audappCapture.name : "Not found"}
          />
        </div>
      </section>

      {/* Config toggles */}
      <section className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground">POC Options</p>
        <div className="rounded-xl bg-card divide-y divide-border/50">
          <label className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer">
            <div>
              <p className="text-sm">Render loopback capture</p>
              <p className="text-xs text-muted-foreground">
                Tap Audapp Input render stream — counts frames when audio plays
              </p>
            </div>
            <Switch
              checked={enableLoopback}
              onCheckedChange={setEnableLoopback}
              disabled={isRunning}
            />
          </label>
          <label className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer">
            <div>
              <p className="text-sm">Capture endpoint read</p>
              <p className="text-xs text-muted-foreground">
                Read Mikrofon (Audapp Input) — likely silent without driver bridge
              </p>
            </div>
            <Switch
              checked={enableCapture}
              onCheckedChange={setEnableCapture}
              disabled={isRunning}
            />
          </label>
          <label className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer">
            <div>
              <p className="text-sm">Physical monitor output</p>
              <p className="text-xs text-muted-foreground">
                Route loopback to a physical speaker (may cause echo)
              </p>
            </div>
            <Switch
              checked={enableMonitor}
              onCheckedChange={setEnableMonitor}
              disabled={isRunning}
            />
          </label>
        </div>

        {/* Physical output selector */}
        {enableMonitor && candidates.physicalOutputs.length > 0 && (
          <div className="rounded-xl bg-card divide-y divide-border/50">
            <p className="px-4 py-2.5 text-xs font-medium text-muted-foreground">Output device</p>
            {candidates.physicalOutputs.map((out) => (
              <label key={out.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="monitor-output"
                  value={out.id}
                  checked={(selectedOutputId ?? candidates.physicalOutputs[0]?.id) === out.id}
                  onChange={() => setSelectedOutputId(out.id)}
                  disabled={isRunning}
                  className="shrink-0"
                />
                <span className="text-sm">{out.name}</span>
                {out.isDefault && (
                  <Badge variant="outline" className="text-xs ml-auto">Default</Badge>
                )}
              </label>
            ))}
          </div>
        )}
      </section>

      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={handleStart}
          disabled={isRunning || isLoading || (!enableLoopback && !enableCapture)}
        >
          Start POC
        </Button>
        <Button
          variant="outline"
          onClick={() => void stop()}
          disabled={!isRunning || isLoading}
        >
          Stop POC
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>

      {(error || status.lastError) && (
        <p className="text-sm text-destructive">{error ?? status.lastError}</p>
      )}

      {/* Runtime state */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-medium text-muted-foreground">Runtime</p>
          <Badge variant="outline" className={cn("text-xs", stateColor(status.state))}>
            {status.state}
          </Badge>
          {status.running && (
            <Badge variant="outline" className={cn("text-xs", modeColor(status.mode))}>
              {modeLabel(status.mode)}
            </Badge>
          )}
        </div>

        {status.mode === "resampled_passthrough" && (
          <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-sm">
            <p className="font-medium text-foreground">Resampled pass-through active</p>
            <p className="mt-1 text-muted-foreground">
              Audio from {status.inputFormat ?? "input"} is being resampled to {status.outputFormat ?? "output"} using
              linear interpolation (ratio {status.resamplerRatio.toFixed(5)}) before routing to the
              physical output. If frames_rendered increases, audio should be audible.
            </p>
          </div>
        )}

        {status.mode === "format_mismatch" && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
            <p className="font-medium text-foreground">Format mismatch — pass-through disabled</p>
            <p className="mt-1 text-muted-foreground">
              Non-float format detected: input ({status.inputFormat ?? "unknown"}) → output (
              {status.outputFormat ?? "unknown"}). Resampling requires float32 on both ends.
              Capture counters still increase.
            </p>
          </div>
        )}

        {(status.audappRenderName || status.inputFormat) && (
          <div className="rounded-xl bg-card divide-y divide-border/50 text-sm">
            {status.audappRenderName && <Row label="Input" value={status.audappRenderName} />}
            {status.inputFormat && <Row label="Input format" value={status.inputFormat} />}
            {status.monitorOutputName && <Row label="Output" value={status.monitorOutputName} />}
            {status.outputFormat && <Row label="Output format" value={status.outputFormat} />}
            {status.resamplerActive && (
              <Row label="Resampler ratio" value={status.resamplerRatio.toFixed(5)} />
            )}
            {status.startedAt && (
              <Row label="Started at" value={new Date(status.startedAt).toLocaleTimeString()} />
            )}
          </div>
        )}

        {/* Stability diagnostics — shown when bridge is running with monitor output */}
        {status.running && status.renderBufferFrames > 0 && (
          <section className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Stability Diagnostics</p>
            <div className="rounded-xl bg-card divide-y divide-border/50 text-sm">
              <Row
                label="Buffer fill"
                value={`${status.bufferFillMs.toFixed(1)} ms (target ${status.targetBufferMs.toFixed(0)} ms)`}
              />
              <Row label="Pending frames" value={String(status.pendingFrames)} />
              <Row label="Dropped frames" value={String(status.droppedFrames)} />
              <Row label="Render buffer" value={`${status.renderBufferFrames} frames`} />
              <Row label="Render padding" value={`${status.renderPaddingFrames} frames`} />
              <Row label="Primed frames" value={String(status.primedFrames)} />
              <Row label="Discontinuities" value={String(status.captureDiscontinuityCount)} />
              <Row label="Underruns" value={String(status.monitorOutput.underruns)} />
            </div>
          </section>
        )}
      </section>

      {/* Stream stats */}
      {enableLoopback && (
        <StreamSection title="Render Loopback" stats={status.renderLoopback} />
      )}

      {enableCapture && (
        <StreamSection title="Capture Endpoint Read" stats={status.captureRead} />
      )}

      {/* Monitor output */}
      {enableMonitor && (
        <section className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Monitor Output</p>
          <div className="rounded-xl bg-card divide-y divide-border/50 text-sm">
            <Row
              label="Device"
              value={status.monitorOutputName ?? (status.monitorOutputId ? status.monitorOutputId.slice(0, 36) + "…" : "—")}
            />
            <Row label="Initialize" value={status.monitorOutput.initializeOk ? "OK" : "—"} />
            <Row label="Start" value={status.monitorOutput.startOk ? "OK" : "—"} />
            <Row label="Frames written" value={String(status.monitorOutput.framesWritten)} />
            <Row label="Bytes written" value={status.monitorOutput.bytesWritten > 0 ? `${(status.monitorOutput.bytesWritten / 1024).toFixed(1)} KB` : "0"} />
            <Row label="Underruns" value={String(status.monitorOutput.underruns)} />
            {status.monitorOutput.lastError && (
              <div className="px-4 py-2.5 text-xs text-destructive">
                {status.monitorOutput.lastError}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Post-DSP output meters — shown when bridge is running with physical output */}
      {status.running && status.monitorOutput.active && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-muted-foreground">Master DSP Output</p>
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                status.dspEnabled
                  ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
                  : "bg-muted text-muted-foreground border-border",
              )}
            >
              {status.dspEnabled ? "DSP on" : "pass-through"}
            </Badge>
          </div>
          <div className="space-y-1.5">
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Post-DSP Peak</span>
                <span>{Math.min(100, status.postDspPeak * 100).toFixed(0)}%</span>
              </div>
              <Progress value={Math.min(100, status.postDspPeak * 100)} className="h-1.5" />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Post-DSP RMS</span>
                <span>{Math.min(100, status.postDspRms * 100).toFixed(0)}%</span>
              </div>
              <Progress value={Math.min(100, status.postDspRms * 100)} className="h-1.5" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Meters show level after DSP (gain, EQ, limiter). Configure DSP in the{" "}
            <span className="font-medium text-foreground">Equalizer</span> page.
          </p>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        Render-loopback frames/bytes increase when audio plays through Hoparlör (Audapp Input).
        Silence/glitch count tracks WASAPI SILENT and DATA_DISCONTINUITY flags.
      </p>
    </div>
  );
}
