import { Activity, BellDot, ChevronDown, Moon, RefreshCw, Settings2, Sun } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { discoveryStatusLabel } from "@/lib/discovery-display";
import type { Theme } from "@/lib/theme";
import type { EngineStatus, SectionId } from "@/types/audio";
import type { AudioDiscoveryStatus } from "@/types/discovery";

interface TopbarProps {
  activeLabel: string;
  version: string;
  status: EngineStatus;
  discoveryStatus: AudioDiscoveryStatus;
  theme: Theme;
  onToggleTheme: () => void;
  onJump: (section: SectionId) => void;
  onRefreshDiscovery?: () => void;
  isDiscoveryLoading?: boolean;
}

export function Topbar({
  activeLabel,
  version,
  status,
  discoveryStatus,
  theme,
  onToggleTheme,
  onJump,
  onRefreshDiscovery,
  isDiscoveryLoading = false,
}: TopbarProps) {
  const warningCount = discoveryStatus.warnings.length + status.warnings.length;

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background px-4 py-3 xl:px-8">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-1 items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Workspace
            </p>
            <h2 className="truncate text-lg font-semibold text-foreground">{activeLabel}</h2>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Input className="max-w-md" placeholder="Search routes, devices, profiles, or settings" />
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Activity className="size-3.5" />
              {discoveryStatusLabel(discoveryStatus)}
            </Badge>
            <Badge variant="outline">{discoveryStatus.deviceCount} devices</Badge>
            <Badge variant="outline">{warningCount} warnings</Badge>
            <Badge variant="outline">v{version}</Badge>
            {onRefreshDiscovery ? (
              <Button
                variant="outline"
                size="sm"
                onClick={onRefreshDiscovery}
                disabled={isDiscoveryLoading}
              >
                <RefreshCw className={`size-4 ${isDiscoveryLoading ? "animate-spin" : ""}`} />
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={onToggleTheme}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {theme === "dark" ? "Light" : "Dark"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Quick actions
                  <ChevronDown className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Navigate</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => onJump("dashboard")}>
                  <BellDot className="size-4" />
                  Review status panel
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onJump("profiles")}>
                  <Activity className="size-4" />
                  Activate a profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onJump("settings")}>
                  <Settings2 className="size-4" />
                  Open settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}
