import { Moon, RefreshCw, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { discoveryStatusLabel } from "@/lib/discovery-display";
import type { Theme } from "@/lib/theme";
import type { AudioDiscoveryStatus } from "@/types/discovery";

interface TopbarProps {
  activeLabel: string;
  version: string;
  discoveryStatus: AudioDiscoveryStatus;
  theme: Theme;
  onToggleTheme: () => void;
  onRefreshDiscovery?: () => void;
  isDiscoveryLoading?: boolean;
}

export function Topbar({
  activeLabel,
  version,
  discoveryStatus,
  theme,
  onToggleTheme,
  onRefreshDiscovery,
  isDiscoveryLoading = false,
}: TopbarProps) {
  const hasWarnings = discoveryStatus.warnings.length > 0;
  const isDiscoveryReady = discoveryStatus.deviceCount > 0;

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background px-4 py-2.5 xl:px-6">
      <h2 className="text-sm font-semibold text-foreground">{activeLabel}</h2>

      <div className="flex items-center gap-1.5">
        {/* Discovery status dot */}
        <div className="flex items-center gap-1.5 pr-1">
          <span
            className={cn(
              "inline-block size-1.5 rounded-full",
              isDiscoveryReady ? "bg-green-500" : "bg-muted-foreground/40",
            )}
          />
          <span className="text-xs text-muted-foreground">
            {discoveryStatusLabel(discoveryStatus)}
          </span>
          {hasWarnings && (
            <span className="text-xs text-amber-500 dark:text-amber-400">
              · {discoveryStatus.warnings.length} warning{discoveryStatus.warnings.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {onRefreshDiscovery ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onRefreshDiscovery}
            disabled={isDiscoveryLoading}
            title="Refresh discovery"
          >
            <RefreshCw className={cn("size-3.5", isDiscoveryLoading && "animate-spin")} />
          </Button>
        ) : null}

        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onToggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
        </Button>

        <span className="pl-1 text-xs text-muted-foreground/50">v{version}</span>
      </div>
    </header>
  );
}
