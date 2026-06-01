import type { AudioChannel, AudioDevice } from "@/types/audio";

import { VerticalChannelStrip } from "./vertical-channel-strip";

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
  settingsError?: string | null;
  settingsWarning?: string | null;
}

export function MixerView(props: MixerViewProps) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Mixer</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Local group controls — mute and volume apply to all sessions assigned to each channel. Audio is not routed.
        </p>
        {props.settingsWarning && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">{props.settingsWarning}</p>
        )}
        {props.settingsError && (
          <p className="mt-1 text-xs text-destructive">{props.settingsError}</p>
        )}
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-min items-stretch justify-start gap-3">
          {props.channels.map((channel) => (
            <VerticalChannelStrip
              key={channel.id}
              channelId={channel.id}
              name={channel.name}
              volumePercent={channel.volume}
              muted={channel.muted}
              activeSessionCount={props.assignmentCountsByChannel[channel.id] ?? 0}
              onVolumeChange={(value) => props.onVolumeChange(channel.id, value)}
              onVolumeCommit={(value) => props.onVolumeCommit(channel.id, value)}
              onMuteToggle={() => props.onMuteToggle(channel.id, !channel.muted)}
              error={props.channelErrors[channel.id] ?? null}
              isPending={props.channelIsPending(channel.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
