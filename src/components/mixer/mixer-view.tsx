import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AudioChannel, AudioDevice } from "@/types/audio";

import { ChannelStrip } from "./channel-strip";

interface MixerViewProps {
  channels: AudioChannel[];
  assignmentCountsByChannel: Record<string, number>;
  outputDevices: AudioDevice[];
  onVolumeChange: (id: string, value: number) => void;
  onVolumeCommit: (id: string, value: number) => void;
  onMuteToggle: (id: string, newMuted: boolean) => void;
  onSoloToggle: (id: string) => void;
  onOutputChange: (id: string, outputDeviceId: string) => void;
  channelErrors: Record<string, string>;
  channelIsPending: (id: string) => boolean;
}

export function MixerView(props: MixerViewProps) {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Mixer"
        title="Channel strips"
        description="Local group controls — mute and volume apply to all sessions currently assigned to each channel. This does not route audio yet."
        actions={
          <Button variant="outline">
            Create channel profile
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {props.channels.map((channel) => {
          const count = props.assignmentCountsByChannel[channel.id] ?? 0;
          const sessionLabel =
            count === 0
              ? "No assigned sessions"
              : count === 1
                ? "1 active session"
                : `${count} active sessions`;

          return (
            <div key={channel.id} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <Badge variant="outline">{sessionLabel}</Badge>
                <span className="text-xs text-muted-foreground">Local group controls</span>
              </div>
              <ChannelStrip
                channel={channel}
                outputDevices={props.outputDevices}
                onVolumeChange={props.onVolumeChange}
                onVolumeCommit={props.onVolumeCommit}
                onMuteToggle={props.onMuteToggle}
                onSoloToggle={props.onSoloToggle}
                onOutputChange={props.onOutputChange}
                error={props.channelErrors[channel.id] ?? null}
                isPending={props.channelIsPending(channel.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
