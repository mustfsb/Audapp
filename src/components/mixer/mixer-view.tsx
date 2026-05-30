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
  onMuteToggle: (id: string) => void;
  onSoloToggle: (id: string) => void;
  onOutputChange: (id: string, outputDeviceId: string) => void;
}

export function MixerView(props: MixerViewProps) {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Mixer"
        title="Channel strips"
        description="Mock channel strips for local grouping only. Real routing is not active yet. Assigned app counts come from Audapp-local metadata."
        actions={
          <Button variant="outline">
            Create channel profile
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {props.channels.map((channel) => (
          <div key={channel.id} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <Badge variant="outline">
                {props.assignmentCountsByChannel[channel.id] ?? 0} assigned apps
              </Badge>
              <span className="text-xs text-muted-foreground">Local grouping only</span>
            </div>
            <ChannelStrip
            channel={channel}
            outputDevices={props.outputDevices}
            onVolumeChange={props.onVolumeChange}
            onMuteToggle={props.onMuteToggle}
            onSoloToggle={props.onSoloToggle}
            onOutputChange={props.onOutputChange}
          />
          </div>
        ))}
      </div>
    </div>
  );
}
