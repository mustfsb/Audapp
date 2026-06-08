import { Gamepad2, Globe, Headphones, Music, Volume2, VolumeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  general: Volume2,
  game: Gamepad2,
  music: Music,
  browser: Globe,
};

export type MixerChannelStripProps = {
  channelId: string;
  name: string;
  volumePercent: number;
  muted: boolean;
  solo?: boolean;
  mutedBySolo?: boolean;
  apps: Array<{ name: string; hasWarning: boolean }>;
  onVolumeChange: (value: number) => void;
  onVolumeCommit: (value: number) => void;
  onMuteToggle: () => void;
  onSoloToggle?: () => void;
  error?: string | null;
  isPending?: boolean;
};

export function VerticalChannelStrip({
  channelId,
  name,
  volumePercent,
  muted,
  solo = false,
  mutedBySolo = false,
  apps,
  onVolumeChange,
  onVolumeCommit,
  onMuteToggle,
  onSoloToggle,
  error,
  isPending,
}: MixerChannelStripProps) {
  const Icon = CHANNEL_ICONS[channelId] ?? Volume2;
  const hasAnyWarning = apps.some((a) => a.hasWarning);

  return (
    <div
      className={cn(
        "px-4 py-3 transition-opacity",
        isPending && "opacity-60",
        mutedBySolo && !solo && "opacity-40",
      )}
    >
      <div className="flex items-center gap-3">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="w-16 shrink-0 text-sm font-medium">{name}</span>
        <Slider
          className="flex-1"
          value={[volumePercent]}
          min={0}
          max={100}
          step={1}
          disabled={isPending || mutedBySolo}
          onValueChange={(values) => onVolumeChange(values[0] ?? volumePercent)}
          onValueCommit={(values) => onVolumeCommit(values[0] ?? volumePercent)}
        />
        <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
          {volumePercent}%
        </span>
        {onSoloToggle && (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "size-7 shrink-0",
              solo
                ? "bg-blue-500/20 text-blue-600 hover:bg-blue-500/30 dark:text-blue-400"
                : "text-muted-foreground",
            )}
            disabled={isPending}
            aria-label={solo ? `Unsolo ${name}` : `Solo ${name}`}
            onClick={onSoloToggle}
          >
            <Headphones className="size-3.5" />
          </Button>
        )}
        <Button
          variant={muted ? "destructive" : "ghost"}
          size="icon"
          className={cn("size-7 shrink-0", !muted && "text-muted-foreground")}
          disabled={isPending}
          aria-label={muted ? `Unmute ${name}` : `Mute ${name}`}
          onClick={onMuteToggle}
        >
          {muted ? <VolumeOff className="size-3.5" /> : <Volume2 className="size-3.5" />}
        </Button>
      </div>

      <div className="mt-1 flex items-center gap-1.5 pl-7">
        {hasAnyWarning && (
          <span className="inline-block size-1.5 shrink-0 rounded-full bg-amber-500" />
        )}
        <p className="truncate text-[11px] text-muted-foreground">
          {apps.length === 0 ? "No apps" : apps.map((a) => a.name).join(" · ")}
        </p>
      </div>

      {error && (
        <p className="mt-1 pl-7 text-[11px] text-destructive">{error}</p>
      )}
    </div>
  );
}
