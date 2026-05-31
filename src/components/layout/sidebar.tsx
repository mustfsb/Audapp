import {
  BarChart3,
  FlaskConical,
  LayoutGrid,
  Mic2,
  MonitorSpeaker,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Waves,
  Workflow,
} from "lucide-react";

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
};

interface SidebarProps {
  items: NavigationItem[];
  activeSection: SectionId;
  onSelect: (section: SectionId) => void;
  deviceCount: number;
}

export function Sidebar({ items, activeSection, onSelect, deviceCount }: SidebarProps) {
  return (
    <aside className="border-b border-sidebar-border bg-sidebar lg:min-h-screen lg:border-r lg:border-b-0">
      <div className="flex h-full flex-col gap-4 p-3">
        {/* Branding */}
        <div className="flex items-center gap-2 px-2 pt-1">
          <BarChart3 className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold tracking-tight text-foreground">Audapp</span>
        </div>

        {/* Navigation */}
        <nav className="grid gap-0.5 lg:flex lg:flex-1 lg:flex-col">
          {items.map((item) => {
            const Icon = icons[item.id];
            const isActive = item.id === activeSection;

            return (
              <button
                key={item.id}
                className={cn(
                  "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
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
        <div className="border-t border-sidebar-border pt-3 text-xs text-muted-foreground px-2 pb-1">
          {deviceCount > 0 ? (
            <span>{deviceCount} device{deviceCount !== 1 ? "s" : ""} connected</span>
          ) : (
            <span>No devices connected</span>
          )}
        </div>
      </div>
    </aside>
  );
}
