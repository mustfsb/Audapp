import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  LayoutGrid,
  Mic2,
  MonitorSpeaker,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Waves,
  Route,
  Workflow,
  Cable,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SectionId } from "@/types/audio";

export interface NavigationItem {
  id: SectionId;
  label: string;
  description: string;
}

const icons: Record<SectionId, React.ElementType> = {
  dashboard: LayoutGrid,
  mixer: SlidersHorizontal,
  apps: Workflow,
  devices: MonitorSpeaker,
  equalizer: Waves,
  noise: Mic2,
  profiles: Sparkles,
  settings: Settings2,
  engine: FlaskConical,
  routing: Route,
  bridge: Cable,
};

interface SidebarProps {
  items: NavigationItem[];
  activeSection: SectionId;
  onSelect: (section: SectionId) => void;
  deviceCount: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({
  items,
  activeSection,
  onSelect,
  deviceCount,
  isCollapsed,
  onToggleCollapse,
}: SidebarProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <aside className="border-b border-sidebar-border bg-sidebar lg:min-h-screen lg:border-r lg:border-b-0">
        <div className="flex h-full flex-col gap-3 py-4 px-2">
          {/* Branding row */}
          <div className={cn("flex items-center mb-1", isCollapsed ? "justify-center" : "justify-between px-1")}>
            {isCollapsed ? (
              <BarChart3 className="size-4 text-muted-foreground" />
            ) : (
              <>
                <div className="flex items-center gap-2 px-1">
                  <BarChart3 className="size-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">Audapp</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground"
                  onClick={onToggleCollapse}
                  title="Collapse sidebar"
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
              </>
            )}
          </div>

          {isCollapsed && (
            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                onClick={onToggleCollapse}
                title="Expand sidebar"
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}

          {/* Navigation */}
          <nav className="flex flex-1 flex-col gap-0.5">
            {items.map((item) => {
              const Icon = icons[item.id];
              const isActive = item.id === activeSection;

              if (isCollapsed) {
                return (
                  <Tooltip key={item.id}>
                    <TooltipTrigger asChild>
                      <button
                        className={cn(
                          "flex w-full items-center justify-center rounded-lg p-2 transition-colors",
                          isActive
                            ? "bg-sidebar-accent text-foreground"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                        )}
                        onClick={() => onSelect(item.id)}
                      >
                        <Icon className="size-4 shrink-0" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <button
                  key={item.id}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                  onClick={() => onSelect(item.id)}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Footer */}
          {!isCollapsed && (
            <div className="border-t border-sidebar-border pt-3 px-3 text-xs text-muted-foreground pb-1">
              {deviceCount > 0 ? (
                <span>{deviceCount} device{deviceCount !== 1 ? "s" : ""}</span>
              ) : (
                <span>No devices</span>
              )}
            </div>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
