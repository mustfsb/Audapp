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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[220px_minmax(0,1fr)]">
        <Sidebar
          items={items}
          activeSection={activeSection}
          onSelect={onSelectSection}
          deviceCount={deviceCount}
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
