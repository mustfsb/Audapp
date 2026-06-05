import { useMemo, useState } from "react";

import { AudappChannelsStatus } from "@/components/audapp/audapp-channels-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import type { AudappChannelEndpoint } from "@/lib/audapp-endpoints";
import { useAudioBridge } from "@/lib/use-audio-bridge";
import { useMultichannelBridge } from "@/lib/use-multichannel-bridge";
import { useRouting } from "@/lib/use-routing";
import { cn } from "@/lib/utils";
import type {
  BridgeMode,
  BridgePocConfig,
  MultichannelSourceStatus,
} from "@/types/bridge";

const AUDAPP_RENDER_ID =
  "{0.0.0.00000000}.{6dee1be1-f344-45e4-aa77-2fb20caac6b9}";
const AUDAPP_CAPTURE_ID =
  "{0.0.1.00000000}.{84bbfd53-05f2-4232-b20b-f8c4237c18d6}";

const CHANNEL_ORDER = ["general", "music", "game", "browser"] as const;

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
    case "passthrough":
      return "pass-through";
    case "resampled_passthrough":
      return "resampled pass-through";
    case "format_mismatch":
      return "format mismatch";
    case "error":
      return "error";
    default:
      return "capture only";
  }
}

function modeColor(mode: BridgeMode): string {
  switch (mode) {
    case "passthrough":
      return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30";
    case "resampled_passthrough":
      return "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30";
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
      <span className="font-mono text-xs text-right">{value}</span>
    </div>
  );
}

function MeterRow({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <Progress value={pct} className="h-1.5" />
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
        <Row label="Initialize" value={stats.initializeOk ? "OK" : "-"} />
        <Row label="Start" value={stats.startOk ? "OK" : "-"} />
        <Row label="Packets" value={String(stats.packetsRead)} />
        <Row label="Frames" value={String(stats.framesRead)} />
        <Row
          label="Bytes"
          value={stats.bytesRead > 0 ? `${(stats.bytesRead / 1024).toFixed(1)} KB` : "0"}
        />
        <Row label="Silence/glitch" value={String(stats.silenceCount)} />
        {stats.lastError && (
          <div className="px-4 py-2.5 text-xs text-destructive">{stats.lastError}</div>
        )}
      </div>
      {stats.active && (
        <div className="space-y-1.5">
          <MeterRow label="Peak" value={stats.peak} />
          <MeterRow label="RMS" value={stats.rms} />
        </div>
      )}
    </section>
  );
}

function SourceCard({
  channel,
  source,
}: {
  channel: AudappChannelEndpoint;
  source: MultichannelSourceStatus | null;
}) {
  const available = source?.available ?? channel.available;
  const active = source?.active ?? false;
  const endpointName = source?.endpointName ?? channel.deviceName ?? "Not found";
  const inputFormat = source?.inputFormat ?? "Unknown";

  return (
    <section className="rounded-xl border border-border/70 bg-card px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{channel.label}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{endpointName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn("text-[10px]", available ? stateColor("running") : stateColor("stopped"))}
          >
            {available ? "available" : "missing"}
          </Badge>
          <Badge variant="outline" className={cn("text-[10px]", stateColor(active ? "running" : "stopped"))}>
            {active ? "running" : "idle"}
          </Badge>
        </div>
      </div>

      <div className="rounded-lg bg-background/60 divide-y divide-border/50 text-sm">
        <Row label="Input format" value={inputFormat} />
        <Row label="Gain" value={`${source?.gainPercent ?? 100}%`} />
        <Row label="Muted" value={source?.muted ? "Yes" : "No"} />
        <Row label="Packets" value={String(source?.stream.packetsRead ?? 0)} />
        <Row label="Frames" value={String(source?.stream.framesRead ?? 0)} />
        <Row label="Pending" value={String(source?.pendingFrames ?? 0)} />
        <Row label="Dropped" value={String(source?.droppedFrames ?? 0)} />
        <Row label="Discontinuities" value={String(source?.discontinuityCount ?? 0)} />
        {source?.stream.lastError && (
          <div className="px-4 py-2.5 text-xs text-destructive">{source.stream.lastError}</div>
        )}
      </div>

      <div className="space-y-1.5">
        <MeterRow label="Peak" value={source?.stream.peak ?? 0} />
        <MeterRow label="RMS" value={source?.stream.rms ?? 0} />
      </div>
    </section>
  );
}

interface BridgeLabViewProps {
  audappChannelEndpoints: AudappChannelEndpoint[];
}

export function BridgeLabView({ audappChannelEndpoints }: BridgeLabViewProps) {
  const legacy = useAudioBridge();
  const multichannel = useMultichannelBridge();
  const {
    status: routing,
    isLoading: routingLoading,
    error: routingError,
    enable: enableRouting,
    disable: disableRouting,
  } = useRouting();

  const [enableLoopback, setEnableLoopback] = useState(true);
  const [enableCapture, setEnableCapture] = useState(true);
  const [enableMonitor, setEnableMonitor] = useState(false);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const [routingOutputId, setRoutingOutputId] = useState<string | null>(null);

  const legacyRunning = legacy.status.state === "running" || legacy.status.state === "starting";
  const renderEndpointId = legacy.candidates.audappRender?.id ?? AUDAPP_RENDER_ID;
  const captureEndpointId = legacy.candidates.audappCapture?.id ?? AUDAPP_CAPTURE_ID;
  const monitorEndpointId = enableMonitor
    ? selectedOutputId ?? legacy.candidates.physicalOutputs[0]?.id ?? null
    : null;

  const sourceMap = useMemo(
    () => new Map(multichannel.status.sources.map((source) => [source.channelId, source])),
    [multichannel.status.sources],
  );

  const effectiveRoutingOutputId =
    routingOutputId ??
    routing.selectedOutputId ??
    multichannel.candidates.physicalOutputs[0]?.id ??
    null;

  const combinedRoutingError =
    routing.lastError ??
    routingError ??
    multichannel.error ??
    multichannel.status.lastError;

  function handleLegacyStart() {
    const config: BridgePocConfig = {
      audappRenderEndpointId: renderEndpointId,
      audappCaptureEndpointId: captureEndpointId,
      monitorOutputEndpointId: monitorEndpointId,
      enableRenderLoopbackCapture: enableLoopback,
      enableCaptureEndpointRead: enableCapture,
      enablePhysicalMonitorOutput: enableMonitor,
    };
    void legacy.start(config);
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Bridge Lab</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Phase 21I - always-on multi-channel routing with a legacy Audapp Input
          diagnostic path below.
        </p>
      </div>

      <AudappChannelsStatus
        endpoints={audappChannelEndpoints}
        description="Audapp uses these four Windows AudappChannels render endpoints as simultaneous sources. Audapp Input remains available below for diagnostics only."
      />

      <section className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-medium text-muted-foreground">
            Always-On Multi-Channel Bridge
          </p>
          <Badge variant="outline" className={cn("text-xs", stateColor(routing.bridgeState))}>
            {routing.bridgeState}
          </Badge>
          {routing.routingEnabled && (
            <Badge variant="outline" className="text-xs bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30">
              active
            </Badge>
          )}
          {routing.autoStarted && (
            <Badge variant="outline" className="text-xs bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30">
              auto-start
            </Badge>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card divide-y divide-border/50 text-sm">
          <Row
            label="Current Windows output"
            value={routing.currentDefaultRenderName ?? "-"}
          />
          <Row
            label="Audapp default during routing"
            value={routing.audappDefaultRenderName ?? "Audapp General not found"}
          />
          <Row
            label="Physical output"
            value={
              routing.selectedOutputName ??
              multichannel.status.monitorOutput.outputName ??
              "Not selected"
            }
          />
          <Row
            label="Routing mode"
            value={
              routing.bridgeState === "running"
                ? "Multi-channel active"
                : routing.bridgeState === "starting"
                  ? "Multi-channel starting"
                  : routing.bridgeState === "error"
                    ? "Multi-channel error"
                    : "Idle"
            }
          />
          {routing.previousDefaultRenderName && (
            <Row
              label="Restore target"
              value={routing.previousDefaultRenderName}
            />
          )}
        </div>

        {!routing.routingEnabled && multichannel.candidates.physicalOutputs.length > 0 && (
          <div className="rounded-xl bg-card divide-y divide-border/50">
            <p className="px-4 py-2.5 text-xs font-medium text-muted-foreground">
              Route to physical output
            </p>
            {multichannel.candidates.physicalOutputs.map((out) => (
              <label
                key={out.id}
                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer"
              >
                <input
                  type="radio"
                  name="routing-output"
                  value={out.id}
                  checked={
                    (routingOutputId ??
                      routing.selectedOutputId ??
                      multichannel.candidates.physicalOutputs[0]?.id) === out.id
                  }
                  onChange={() => setRoutingOutputId(out.id)}
                  className="shrink-0"
                />
                <span className="text-sm">{out.name}</span>
                {out.isDefault && (
                  <Badge variant="outline" className="text-xs ml-auto">
                    Default
                  </Badge>
                )}
              </label>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!routing.routingEnabled ? (
            <Button
              onClick={() =>
                effectiveRoutingOutputId && void enableRouting(effectiveRoutingOutputId)
              }
              disabled={
                routingLoading ||
                !effectiveRoutingOutputId ||
                !routing.audappDefaultRenderName
              }
            >
              Enable Audapp Routing
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={() => void disableRouting()}
              disabled={routingLoading}
            >
              Disable Audapp Routing
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              void multichannel.refresh();
              void multichannel.fetchCandidates();
            }}
            disabled={multichannel.isLoading || multichannel.candidatesLoading}
          >
            Refresh bridge status
          </Button>
        </div>

        {combinedRoutingError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
            <p className="font-medium text-destructive">Routing error</p>
            <p className="mt-1 text-xs text-muted-foreground">{combinedRoutingError}</p>
            {routing.previousDefaultRenderName && (
              <p className="mt-1 text-xs text-muted-foreground">
                Manual recovery: open Windows Sound settings and set output to{" "}
                <strong>{routing.previousDefaultRenderName}</strong>.
              </p>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Active routing sets the Windows default render endpoint to Audapp General,
          then mixes General, Music, Game, and Browser simultaneously back to the
          selected physical output. Internal Audapp channel labels do not move a
          Windows app by themselves.
        </p>

        <div className="grid gap-3 lg:grid-cols-2">
          {CHANNEL_ORDER.map((channelId) => {
            const endpoint =
              audappChannelEndpoints.find((item) => item.channelId === channelId) ?? {
                channelId,
                label: channelId,
                available: false,
                deviceId: null,
                deviceName: null,
                state: null,
              };
            return (
              <SourceCard
                key={channelId}
                channel={endpoint}
                source={sourceMap.get(channelId) ?? null}
              />
            );
          })}
        </div>

        <section className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Physical Output</p>
          <div className="rounded-xl bg-card divide-y divide-border/50 text-sm">
            <Row
              label="Device"
              value={multichannel.status.monitorOutput.outputName ?? "Not active"}
            />
            <Row
              label="Format"
              value={multichannel.status.monitorOutput.outputFormat ?? "Unknown"}
            />
            <Row
              label="Frames written"
              value={String(multichannel.status.monitorOutput.output.framesWritten)}
            />
            <Row
              label="Bytes written"
              value={
                multichannel.status.monitorOutput.output.bytesWritten > 0
                  ? `${(multichannel.status.monitorOutput.output.bytesWritten / 1024).toFixed(1)} KB`
                  : "0"
              }
            />
            <Row
              label="Underruns"
              value={String(multichannel.status.monitorOutput.output.underruns)}
            />
            <Row
              label="Buffer fill"
              value={`${multichannel.status.monitorOutput.bufferFillMs.toFixed(1)} ms`}
            />
          </div>
          {multichannel.status.running && (
            <div className="space-y-1.5">
              <MeterRow label="Post-DSP Peak" value={multichannel.status.postDspPeak} />
              <MeterRow label="Post-DSP RMS" value={multichannel.status.postDspRms} />
            </div>
          )}
        </section>
      </section>

      <details className="group rounded-xl border border-border/70 bg-card/60">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Legacy Audapp Input Bridge</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Diagnostic-only single-source bridge for the legacy Audapp Input
              endpoint. This is not the primary routing path in Phase 21I.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn("text-xs", stateColor(legacy.status.state))}>
              {legacy.status.state}
            </Badge>
          </div>
        </summary>

        <div className="space-y-5 border-t border-border/60 px-4 py-4">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Manual legacy bridge workflow</p>
            <ol className="mt-1 list-decimal list-inside space-y-0.5">
              <li>Set Windows output manually to Audapp Input.</li>
              <li>Play audio in any app and start the legacy bridge.</li>
              <li>Use counters below to inspect loopback and capture behavior.</li>
            </ol>
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                Legacy discovered endpoints
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void legacy.fetchCandidates()}
                disabled={legacy.candidatesLoading}
              >
                {legacy.candidatesLoading ? "Scanning..." : "Rescan"}
              </Button>
            </div>
            <div className="rounded-xl bg-card divide-y divide-border/50 text-sm">
              <Row
                label="Audapp Input render"
                value={legacy.candidates.audappRender?.name ?? "Not found"}
              />
              <Row
                label="Audapp Input capture"
                value={legacy.candidates.audappCapture?.name ?? "Not found"}
              />
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Legacy POC options</p>
            <div className="rounded-xl bg-card divide-y divide-border/50">
              <label className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer">
                <div>
                  <p className="text-sm">Render loopback capture</p>
                  <p className="text-xs text-muted-foreground">
                    Tap the Audapp Input render stream and count live frames.
                  </p>
                </div>
                <Switch
                  checked={enableLoopback}
                  onCheckedChange={setEnableLoopback}
                  disabled={legacyRunning}
                />
              </label>
              <label className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer">
                <div>
                  <p className="text-sm">Capture endpoint read</p>
                  <p className="text-xs text-muted-foreground">
                    Read the Audapp Input capture endpoint directly.
                  </p>
                </div>
                <Switch
                  checked={enableCapture}
                  onCheckedChange={setEnableCapture}
                  disabled={legacyRunning}
                />
              </label>
              <label className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer">
                <div>
                  <p className="text-sm">Physical monitor output</p>
                  <p className="text-xs text-muted-foreground">
                    Route the legacy loopback stream to a physical speaker.
                  </p>
                </div>
                <Switch
                  checked={enableMonitor}
                  onCheckedChange={setEnableMonitor}
                  disabled={legacyRunning}
                />
              </label>
            </div>

            {enableMonitor && legacy.candidates.physicalOutputs.length > 0 && (
              <div className="rounded-xl bg-card divide-y divide-border/50">
                <p className="px-4 py-2.5 text-xs font-medium text-muted-foreground">
                  Legacy monitor output
                </p>
                {legacy.candidates.physicalOutputs.map((out) => (
                  <label
                    key={out.id}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="legacy-output"
                      value={out.id}
                      checked={(selectedOutputId ?? legacy.candidates.physicalOutputs[0]?.id) === out.id}
                      onChange={() => setSelectedOutputId(out.id)}
                      disabled={legacyRunning}
                      className="shrink-0"
                    />
                    <span className="text-sm">{out.name}</span>
                    {out.isDefault && (
                      <Badge variant="outline" className="text-xs ml-auto">
                        Default
                      </Badge>
                    )}
                  </label>
                ))}
              </div>
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleLegacyStart}
              disabled={legacyRunning || legacy.isLoading || (!enableLoopback && !enableCapture)}
            >
              Start legacy bridge
            </Button>
            <Button
              variant="outline"
              onClick={() => void legacy.stop()}
              disabled={!legacyRunning || legacy.isLoading}
            >
              Stop legacy bridge
            </Button>
            <Button variant="ghost" onClick={() => void legacy.refresh()}>
              Refresh
            </Button>
          </div>

          {(legacy.error || legacy.status.lastError) && (
            <p className="text-sm text-destructive">
              {legacy.error ?? legacy.status.lastError}
            </p>
          )}

          <section className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-medium text-muted-foreground">Legacy runtime</p>
              <Badge variant="outline" className={cn("text-xs", stateColor(legacy.status.state))}>
                {legacy.status.state}
              </Badge>
              {legacy.status.running && (
                <Badge
                  variant="outline"
                  className={cn("text-xs", modeColor(legacy.status.mode))}
                >
                  {modeLabel(legacy.status.mode)}
                </Badge>
              )}
            </div>

            <div className="rounded-xl bg-card divide-y divide-border/50 text-sm">
              {legacy.status.audappRenderName && (
                <Row label="Input" value={legacy.status.audappRenderName} />
              )}
              {legacy.status.inputFormat && (
                <Row label="Input format" value={legacy.status.inputFormat} />
              )}
              {legacy.status.monitorOutputName && (
                <Row label="Output" value={legacy.status.monitorOutputName} />
              )}
              {legacy.status.outputFormat && (
                <Row label="Output format" value={legacy.status.outputFormat} />
              )}
              {legacy.status.resamplerActive && (
                <Row
                  label="Resampler ratio"
                  value={legacy.status.resamplerRatio.toFixed(5)}
                />
              )}
              {legacy.status.startedAt && (
                <Row
                  label="Started at"
                  value={new Date(legacy.status.startedAt).toLocaleTimeString()}
                />
              )}
            </div>

            {legacy.status.running && legacy.status.renderBufferFrames > 0 && (
              <div className="rounded-xl bg-card divide-y divide-border/50 text-sm">
                <Row
                  label="Buffer fill"
                  value={`${legacy.status.bufferFillMs.toFixed(1)} ms (target ${legacy.status.targetBufferMs.toFixed(0)} ms)`}
                />
                <Row label="Pending frames" value={String(legacy.status.pendingFrames)} />
                <Row label="Dropped frames" value={String(legacy.status.droppedFrames)} />
                <Row
                  label="Render buffer"
                  value={`${legacy.status.renderBufferFrames} frames`}
                />
                <Row
                  label="Render padding"
                  value={`${legacy.status.renderPaddingFrames} frames`}
                />
                <Row label="Primed frames" value={String(legacy.status.primedFrames)} />
                <Row
                  label="Discontinuities"
                  value={String(legacy.status.captureDiscontinuityCount)}
                />
                <Row
                  label="Underruns"
                  value={String(legacy.status.monitorOutput.underruns)}
                />
              </div>
            )}
          </section>

          {enableLoopback && (
            <StreamSection title="Legacy render loopback" stats={legacy.status.renderLoopback} />
          )}

          {enableCapture && (
            <StreamSection title="Legacy capture read" stats={legacy.status.captureRead} />
          )}

          {enableMonitor && (
            <section className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Legacy monitor output
              </p>
              <div className="rounded-xl bg-card divide-y divide-border/50 text-sm">
                <Row
                  label="Device"
                  value={legacy.status.monitorOutputName ?? "Not active"}
                />
                <Row
                  label="Initialize"
                  value={legacy.status.monitorOutput.initializeOk ? "OK" : "-"}
                />
                <Row
                  label="Start"
                  value={legacy.status.monitorOutput.startOk ? "OK" : "-"}
                />
                <Row
                  label="Frames written"
                  value={String(legacy.status.monitorOutput.framesWritten)}
                />
                <Row
                  label="Bytes written"
                  value={
                    legacy.status.monitorOutput.bytesWritten > 0
                      ? `${(legacy.status.monitorOutput.bytesWritten / 1024).toFixed(1)} KB`
                      : "0"
                  }
                />
                <Row
                  label="Underruns"
                  value={String(legacy.status.monitorOutput.underruns)}
                />
              </div>
            </section>
          )}

          {legacy.status.running && legacy.status.monitorOutput.active && (
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Legacy post-DSP output
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    legacy.status.dspEnabled
                      ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
                      : "bg-muted text-muted-foreground border-border",
                  )}
                >
                  {legacy.status.dspEnabled ? "DSP on" : "pass-through"}
                </Badge>
              </div>
              <div className="space-y-1.5">
                <MeterRow label="Post-DSP Peak" value={legacy.status.postDspPeak} />
                <MeterRow label="Post-DSP RMS" value={legacy.status.postDspRms} />
              </div>
            </section>
          )}
        </div>
      </details>
    </div>
  );
}
