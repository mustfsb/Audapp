import { BarChart3, FlaskConical, LayoutGrid, Mic2, MonitorSpeaker, Settings2, SlidersHorizontal, Sparkles, Waves, Workflow } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AudioProfile, SectionId } from "@/types/audio";

export interface NavigationItem {
  id: SectionId;
  label: string;
  description: string;
}

const icons = {
  dashboard: LayoutGrid,
  mixer: SlidersHorizontal,
  apps: Workflow,
  devices: MonitorSpeaker,
  equalizer: Waves,
  noise: Mic2,
  profiles: Sparkles,
  settings: Settings2,
  engine: FlaskConical,
};

interface SidebarProps {
  items: NavigationItem[];
  activeSection: SectionId;
  onSelect: (section: SectionId) => void;
  profiles: AudioProfile[];
  deviceCount: number;
}

export function Sidebar({
  items,
  activeSection,
  onSelect,
  profiles,
  deviceCount,
}: SidebarProps) {
  const activeProfile = profiles.find((profile) => profile.active);

  return (
    <aside className="border-b border-sidebar-border bg-sidebar lg:min-h-screen lg:border-r lg:border-b-0">
      <div className="flex h-full flex-col gap-5 p-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-muted-foreground" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Audapp
            </p>
          </div>
          <h1 className="text-lg font-semibold text-foreground">Audio control desk</h1>
          <p className="text-sm text-muted-foreground">
            Phase 1 builds the routing surface and device UX without claiming real engine control.
          </p>
        </div>

        <nav className="grid gap-1.5 lg:flex lg:flex-1 lg:flex-col">
          {items.map((item) => {
            const Icon = icons[item.id];
            const isActive = item.id === activeSection;

            return (
              <Button
                key={item.id}
                variant="ghost"
                className={cn(
                  "h-auto justify-start rounded-md px-3 py-2.5 text-left",
                  isActive
                    ? "bg-sidebar-accent text-foreground hover:bg-sidebar-accent"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
                onClick={() => onSelect(item.id)}
              >
                <Icon className="mr-3 size-4 shrink-0" />
                <span className="flex flex-col">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.description}
                  </span>
                </span>
              </Button>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-sidebar-border pt-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Active profile</span>
            <Badge variant="secondary">{activeProfile?.name ?? "None"}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Connected devices</span>
            <span className="font-medium text-foreground">{deviceCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Telemetry</span>
            <span className="font-medium text-foreground">Off</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
