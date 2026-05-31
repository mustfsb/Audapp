import { VolumeOff, Volume2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import type { AudioChannel, AudioDevice } from "@/types/audio";

interface ChannelStripProps {
  channel: AudioChannel;
  outputDevices: AudioDevice[];
  onVolumeChange: (id: string, value: number) => void;
  onVolumeCommit: (id: string, value: number) => void;
  onMuteToggle: (id: string, newMuted: boolean) => void;
  onSoloToggle: (id: string) => void;
  onOutputChange: (id: string, outputDeviceId: string) => void;
  error?: string | null;
  isPending?: boolean;
}

export function ChannelStrip({
  channel,
  onVolumeChange,
  onVolumeCommit,
  onMuteToggle,
  error,
  isPending,
}: ChannelStripProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">{channel.name}</CardTitle>
          {isPending && (
            <span className="text-xs text-muted-foreground">Applying…</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pb-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Volume</span>
            <span className="tabular-nums font-medium text-foreground">{channel.volume}%</span>
          </div>
          <Slider
            value={[channel.volume]}
            max={100}
            step={1}
            disabled={isPending}
            onValueChange={(values) => onVolumeChange(channel.id, values[0] ?? channel.volume)}
            onValueCommit={(values) => onVolumeCommit(channel.id, values[0] ?? channel.volume)}
          />
        </div>

        {error && (
          <p className="rounded-sm border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
            {error}
          </p>
        )}
      </CardContent>
      <CardFooter className="pt-0">
        <Button
          variant={channel.muted ? "destructive" : "outline"}
          size="sm"
          className="w-full"
          disabled={isPending}
          onClick={() => onMuteToggle(channel.id, !channel.muted)}
        >
          {channel.muted ? <VolumeOff className="size-3.5" /> : <Volume2 className="size-3.5" />}
          {channel.muted ? "Muted" : "Mute"}
        </Button>
      </CardFooter>
    </Card>
  );
}
