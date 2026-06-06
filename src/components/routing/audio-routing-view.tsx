import { Play, Square, RefreshCw } from "lucide-react";

import { AudappChannelsStatus } from "@/components/audapp/audapp-channels-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AudappChannelEndpoint } from "@/lib/audapp-endpoints";
import { statusBadgeVariant } from "@/lib/badge-variant";
import { useMultichannelBridge } from "@/lib/use-multichannel-bridge";
import { cn } from "@/lib/utils";

interface AudioRoutingViewProps {
  audappChannelEndpoints: AudappChannelEndpoint[];
}

/**
 * Productized routing page. Shows whether Audapp routing is active, which
 * physical device the mixed output uses, and whether the four channels are
 * available — in plain product language, with the raw counters kept in the
 * developer Bridge Lab.
 */
export function AudioRoutingView({ audappChannelEndpoints }: AudioRoutingViewProps) {
  const bridge = useMultichannelBridge();
  const { status } = bridge;
  const monitor = status.monitorOutput;

  const running = status.running;
  const defaultName = monitor.defaultRenderName;
  const windowsDefaultIsGeneral = (defaultName ?? "").toLowerCase().includes("audapp general");
  const physicalOutput = monitor.outputName;
  const hasPhysicalOutput = Boolean(physicalOutput) && !monitor.isPhysicalOutputAudapp;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Audio Routing</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Audapp mixes the four channels and plays them through one physical output.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => void bridge.refresh()}
            title="Refresh"
          >
            <RefreshCw className="size-3.5" />
          </Button>
          {running ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void bridge.stop()}
              disabled={bridge.isLoading}
            >
              <Square className="size-3.5" />
              Stop routing
            </Button>
          ) : (
            <Button size="sm" onClick={() => void bridge.start()} disabled={bridge.isLoading}>
              <Play className="size-3.5" />
              Start routing
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Routing</p>
              <p className="text-xs text-muted-foreground">
                {running
                  ? "Audapp is mixing your channels and sending them to the output device."
                  : "Routing is stopped. Start it to send Audapp channels to your speakers."}
              </p>
            </div>
            <Badge variant={statusBadgeVariant(running ? "ok" : "neutral")}>
              {running ? "Active" : "Stopped"}
            </Badge>
          </div>

          <StatusRow
            label="Output device"
            value={
              monitor.isPhysicalOutputAudapp
                ? "Audapp endpoint (invalid)"
                : physicalOutput ?? "Not selected"
            }
            status={hasPhysicalOutput ? "ok" : "warning"}
            statusLabel={hasPhysicalOutput ? "Selected" : "Needs output"}
          />

          <StatusRow
            label="Windows default"
            value={defaultName ?? "Unknown"}
            status={windowsDefaultIsGeneral ? "ok" : "warning"}
            statusLabel={windowsDefaultIsGeneral ? "Audapp General" : "Set to General"}
          />

          {status.lastError && (
            <p className="text-xs text-destructive">{status.lastError}</p>
          )}
          {!windowsDefaultIsGeneral && running && (
            <p className="text-xs text-muted-foreground">
              For app audio to flow through Audapp, set the Windows default output to{" "}
              <span className="font-medium text-foreground">Audapp General</span>.
            </p>
          )}
        </CardContent>
      </Card>

      <AudappChannelsStatus
        endpoints={audappChannelEndpoints}
        title="Channels"
        description="General is the default channel. Apps can be grouped into Music, Game, or Browser."
      />
    </div>
  );
}

function StatusRow({
  label,
  value,
  status,
  statusLabel,
}: {
  label: string;
  value: string;
  status: "ok" | "warning" | "error";
  statusLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("truncate text-sm font-medium")}>{value}</p>
      </div>
      <Badge variant={statusBadgeVariant(status)}>{statusLabel}</Badge>
    </div>
  );
}
