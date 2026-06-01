import { useState } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import type { Theme } from "@/lib/theme";
import type { AudioProfile, EngineStatus, SectionId } from "@/types/audio";
import type { AudioDiscoveryStatus } from "@/types/discovery";

import { Sidebar, type NavigationItem } from "./sidebar";
import { Topbar } from "./topbar";

interface AppShellProps {
  items: NavigationItem[];
  activeSection: SectionId;
  onSelectSection: (section: SectionId) => void;
  profiles: AudioProfile[];
  deviceCount: number;
  version: string;
  status: EngineStatus;
  discoveryStatus: AudioDiscoveryStatus;
  theme: Theme;
  onToggleTheme: () => void;
  onRefreshDiscovery?: () => void;
  isDiscoveryLoading?: boolean;
  children: React.ReactNode;
}

export function AppShell({
  items,
  activeSection,
  onSelectSection,
  deviceCount,
  version,
  discoveryStatus,
  theme,
  onToggleTheme,
  onRefreshDiscovery,
  isDiscoveryLoading,
  children,
}: AppShellProps) {
  const activeLabel = items.find((item) => item.id === activeSection)?.label ?? "Dashboard";

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("audapp-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });

  function handleToggleCollapse() {
    const next = !isSidebarCollapsed;
    setIsSidebarCollapsed(next);
    try {
      localStorage.setItem("audapp-sidebar-collapsed", String(next));
    } catch {
      // ignore
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div
        className="grid min-h-screen"
        style={{
          gridTemplateColumns: isSidebarCollapsed ? "56px minmax(0, 1fr)" : "220px minmax(0, 1fr)",
          transition: "grid-template-columns 180ms ease",
        }}
      >
        <Sidebar
          items={items}
          activeSection={activeSection}
          onSelect={onSelectSection}
          deviceCount={deviceCount}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
        <div className="min-w-0">
          <Topbar
            activeLabel={activeLabel}
            version={version}
            discoveryStatus={discoveryStatus}
            theme={theme}
            onToggleTheme={onToggleTheme}
            onRefreshDiscovery={onRefreshDiscovery}
            isDiscoveryLoading={isDiscoveryLoading}
          />
          <ScrollArea className="h-[calc(100vh-49px)]">
            <main className="px-4 py-5 xl:px-6 xl:py-6">{children}</main>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
