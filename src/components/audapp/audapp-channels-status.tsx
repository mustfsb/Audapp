import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AudappChannelEndpoint } from "@/lib/audapp-endpoints";

interface AudappChannelsStatusProps {
  endpoints: AudappChannelEndpoint[];
  title?: string;
  description?: string;
  className?: string;
}

/**
 * Compact status panel mapping the four internal output channels to their
 * backing AudappChannels Windows endpoints. Shows real availability only — it
 * does not imply per-app routing is active.
 */
export function AudappChannelsStatus({
  endpoints,
  title = "AudappChannels",
  description,
  className,
}: AudappChannelsStatusProps) {
  const availableCount = endpoints.filter((endpoint) => endpoint.available).length;
  const allAvailable = availableCount === endpoints.length && endpoints.length > 0;

  return (
    <section className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <Badge
          variant="outline"
          className={cn(
            "text-xs",
            allAvailable
              ? "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30"
              : "bg-muted text-muted-foreground border-border",
          )}
        >
          {availableCount}/{endpoints.length} available
        </Badge>
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {endpoints.map((endpoint) => (
          <div
            key={endpoint.channelId}
            className="flex items-center justify-between gap-3 rounded-xl bg-card px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{endpoint.label}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {endpoint.deviceName ?? "No endpoint detected"}
              </p>
            </div>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                endpoint.available
                  ? "bg-green-500/15 text-green-600 dark:text-green-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "inline-block size-1.5 rounded-full",
                  endpoint.available ? "bg-green-500" : "bg-muted-foreground/50",
                )}
              />
              {endpoint.available ? "Available" : "Missing"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
