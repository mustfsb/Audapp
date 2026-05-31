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
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Mixer</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Local group controls — mute and volume apply to all sessions assigned to each channel. Audio is not routed.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {props.channels.map((channel) => {
          const count = props.assignmentCountsByChannel[channel.id] ?? 0;

          return (
            <div key={channel.id} className="space-y-1.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-xs text-muted-foreground">
                  {count === 0
                    ? "No active sessions"
                    : count === 1
                      ? "1 active session"
                      : `${count} active sessions`}
                </span>
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
