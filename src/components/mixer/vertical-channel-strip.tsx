import { VolumeOff, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export type MixerChannelStripProps = {
  channelId: string;
  name: string;
  volumePercent: number;
  muted: boolean;
  activeSessionCount: number;
  onVolumeChange: (value: number) => void;
  onVolumeCommit: (value: number) => void;
  onMuteToggle: () => void;
  error?: string | null;
  isPending?: boolean;
};

export function VerticalChannelStrip({
  name,
  volumePercent,
  muted,
  activeSessionCount,
  onVolumeChange,
  onVolumeCommit,
  onMuteToggle,
  error,
  isPending,
}: MixerChannelStripProps) {
  return (
    <div
      className={cn(
        "flex w-28 shrink-0 flex-col items-center gap-4 rounded-xl bg-card px-3 py-4",
        isPending && "opacity-60",
        muted && "opacity-70",
      )}
    >
      {/* Name + session count */}
      <div className="w-full space-y-0.5 text-center">
        <p className="truncate text-xs font-medium leading-tight">{name}</p>
        <p className="text-[10px] text-muted-foreground">
          {activeSessionCount === 0 ? "—" : `${activeSessionCount} app${activeSessionCount !== 1 ? "s" : ""}`}
        </p>
      </div>

      {/* Fader */}
      <div className="flex flex-1 flex-col items-center gap-2">
        <span className="text-[10px] tabular-nums text-muted-foreground">{volumePercent}%</span>
        <Slider
          orientation="vertical"
          className="h-52"
          value={[volumePercent]}
          max={100}
          step={1}
          disabled={isPending}
          onValueChange={(values) => onVolumeChange(values[0] ?? volumePercent)}
          onValueCommit={(values) => onVolumeCommit(values[0] ?? volumePercent)}
        />
      </div>

      {error && (
        <p className="w-full rounded-lg bg-destructive/10 px-2 py-1 text-center text-[10px] leading-tight text-destructive">
          {error}
        </p>
      )}

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
