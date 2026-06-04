import { VolumeOff, Volume2, Headphones } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export type MixerChannelStripProps = {
  channelId: string;
  name: string;
  volumePercent: number;
  muted: boolean;
  solo?: boolean;
  mutedBySolo?: boolean;
  activeSessionCount: number;
  onVolumeChange: (value: number) => void;
  onVolumeCommit: (value: number) => void;
  onMuteToggle: () => void;
  onSoloToggle?: () => void;
  error?: string | null;
  isPending?: boolean;
};

export function VerticalChannelStrip({
  name,
  volumePercent,
  muted,
  solo = false,
  mutedBySolo = false,
  activeSessionCount,
  onVolumeChange,
  onVolumeCommit,
  onMuteToggle,
  onSoloToggle,
  error,
  isPending,
}: MixerChannelStripProps) {
  return (
    <div
      className={cn(
        "flex w-28 shrink-0 flex-col items-center gap-3 rounded-xl bg-card px-3 py-4",
        isPending && "opacity-60",
        mutedBySolo && !solo && "opacity-50",
      )}
    >
      {/* Name + session count */}
      <div className="w-full space-y-0.5 text-center">
        <p className="truncate text-xs font-medium leading-tight">{name}</p>
        <p className="text-[10px] text-muted-foreground">
          {activeSessionCount === 0
            ? "—"
            : `${activeSessionCount} app${activeSessionCount !== 1 ? "s" : ""}`}
        </p>
      </div>

      {/* State badges */}
      {(solo || mutedBySolo) && (
        <div className="flex flex-wrap justify-center gap-1">
          {solo && (
            <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-blue-500/20 text-blue-600 dark:text-blue-400">
              Solo
            </span>
          )}
          {mutedBySolo && !solo && (
            <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-amber-500/20 text-amber-600 dark:text-amber-400">
              Muted
            </span>
          )}
        </div>
      )}

      {/* Fader */}
      <div className="flex flex-1 flex-col items-center gap-2">
        <span className="text-[10px] tabular-nums text-muted-foreground">{volumePercent}%</span>
        <Slider
          orientation="vertical"
          className="h-44"
          value={[volumePercent]}
          max={100}
          step={1}
          disabled={isPending || mutedBySolo}
          onValueChange={(values) => onVolumeChange(values[0] ?? volumePercent)}
          onValueCommit={(values) => onVolumeCommit(values[0] ?? volumePercent)}
        />
      </div>

      {error && (
        <p className="w-full rounded-lg bg-destructive/10 px-2 py-1 text-center text-[10px] leading-tight text-destructive">
          {error}
        </p>
      )}

      {/* Solo button */}
      {onSoloToggle && (
        <Button
          variant={solo ? "default" : "ghost"}
          size="icon-sm"
          className={cn(
            "size-8",
            solo
              ? "bg-blue-500/20 text-blue-600 dark:text-blue-400 hover:bg-blue-500/30 border-none"
              : "text-muted-foreground",
          )}
          disabled={isPending}
          aria-label={solo ? `Unsolo ${name}` : `Solo ${name}`}
          onClick={onSoloToggle}
        >
          <Headphones className="size-3.5" />
        </Button>
      )}

      {/* Mute button */}
      <Button
        variant={muted ? "destructive" : "ghost"}
        size="icon-sm"
        className={cn("size-8", !muted && "text-muted-foreground")}
        disabled={isPending}
        aria-label={muted ? `Unmute ${name}` : `Mute ${name}`}
        onClick={onMuteToggle}
      >
        {muted ? <VolumeOff className="size-3.5" /> : <Volume2 className="size-3.5" />}
      </Button>
    </div>
  );
}
