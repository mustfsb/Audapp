import { Badge } from "@/components/ui/badge";
import { statusBadgeVariant } from "@/lib/badge-variant";
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
  title = "Channels",
  description,
  className,
}: AudappChannelsStatusProps) {
  const availableCount = endpoints.filter((endpoint) => endpoint.available).length;
  const allAvailable = availableCount === endpoints.length && endpoints.length > 0;

  return (
    <section className={cn("space-y-2", className)}>
      {(title || description) && (
        <div className="space-y-1">
          {title && (
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{title}</p>
              <Badge variant={statusBadgeVariant(allAvailable ? "ok" : "warning")}>
                {availableCount}/{endpoints.length} available
              </Badge>
            </div>
          )}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      )}
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
            <Badge variant={statusBadgeVariant(endpoint.available ? "ok" : "error")}>
              {endpoint.available ? "Available" : "Missing"}
            </Badge>
          </div>
        ))}
      </div>
    </section>
  );
}
