import { AudioLines, Volume2, VolumeOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AudioChannel, AudioDevice } from "@/types/audio";

interface ChannelStripProps {
  channel: AudioChannel;
  outputDevices: AudioDevice[];
  onVolumeChange: (id: string, value: number) => void;
  onMuteToggle: (id: string) => void;
  onSoloToggle: (id: string) => void;
  onOutputChange: (id: string, outputDeviceId: string) => void;
}

export function ChannelStrip({
  channel,
  outputDevices,
  onVolumeChange,
  onMuteToggle,
  onSoloToggle,
  onOutputChange,
}: ChannelStripProps) {
  const selectedOutput = outputDevices.find((device) => device.id === channel.outputDeviceId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle>{channel.name}</CardTitle>
            <p className="text-sm text-muted-foreground capitalize">{channel.bucket}</p>
          </div>
          <Badge variant={channel.solo ? "default" : "outline"}>{channel.solo ? "Solo" : "Ready"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Volume</span>
            <span className="font-medium text-foreground">{channel.volume}%</span>
          </div>
          <Slider
            value={[channel.volume]}
            max={100}
            step={1}
            onValueChange={(values) => onVolumeChange(channel.id, values[0] ?? channel.volume)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Mock meter</span>
            <span className="text-muted-foreground">{channel.peak} peak</span>
          </div>
          <Progress value={channel.peak} />
          <Progress value={channel.meterHold} className="h-1.5 opacity-40" />
        </div>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Output device</p>
          <Select value={channel.outputDeviceId} onValueChange={(value) => onOutputChange(channel.id, value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select output" />
            </SelectTrigger>
            <SelectContent>
              {outputDevices.map((device) => (
                <SelectItem key={device.id} value={device.id}>
                  {device.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Routed to {selectedOutput?.name ?? "no device"}
          </p>
        </div>
      </CardContent>
      <CardFooter className="gap-2 border-t border-border/60 pt-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={channel.muted ? "destructive" : "outline"}
              className="flex-1"
              onClick={() => onMuteToggle(channel.id)}
            >
              {channel.muted ? <VolumeOff className="size-4" /> : <Volume2 className="size-4" />}
              {channel.muted ? "Muted" : "Mute"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle mute for this channel.</TooltipContent>
        </Tooltip>
        <Button
          variant={channel.solo ? "default" : "outline"}
          className="flex-1"
          onClick={() => onSoloToggle(channel.id)}
        >
          <AudioLines className="size-4" />
          {channel.solo ? "Solo on" : "Solo"}
        </Button>
      </CardFooter>
    </Card>
  );
}
