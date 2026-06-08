import { useState } from "react";
import { Gamepad2, Globe, Music, Volume2 } from "lucide-react";

import { DspControls } from "@/components/engine/dsp-controls";
import { DEFAULT_EQ_CHANNEL, EQ_CHANNELS, type EqChannelId } from "@/lib/channel-eq";
import {
  buildEqualizerViewModel,
  EQ_PRESET_CONTENT_CLASSNAME,
  EQ_PRESET_TRIGGER_CLASSNAME,
} from "@/lib/equalizer-view-model";
import { useAudioDsp } from "@/lib/use-audio-dsp";
import { useChannelDsp } from "@/lib/use-channel-dsp";
import { cn } from "@/lib/utils";

const CHANNEL_ICONS: Record<EqChannelId, React.ElementType> = {
  general: Volume2,
  music: Music,
  game: Gamepad2,
  browser: Globe,
};

function ChannelEqPanel({ channelId, label }: { channelId: EqChannelId; label: string }) {
  const channel = useChannelDsp(channelId);
  return (
    <DspControls
      dsp={channel}
      title={`${label} EQ`}
      showInputGain={false}
      showFilters
      presetTriggerClassName={EQ_PRESET_TRIGGER_CLASSNAME}
      presetContentClassName={EQ_PRESET_CONTENT_CLASSNAME}
      footerNote={`${label} audio is processed before it is mixed with the other channels. Gain, filters, limiter and EQ are saved independently for this channel.`}
    />
  );
}

export function EqualizerView() {
  const [selectedChannel, setSelectedChannel] = useState<EqChannelId>(DEFAULT_EQ_CHANNEL);
  const masterDsp = useAudioDsp();
  const view = buildEqualizerViewModel(selectedChannel);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Equalizer</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          One editor, four channels. Select General, Music, Game, or Browser to tune that channel only.
        </p>
      </div>

      <section className="space-y-4 rounded-2xl border border-border/70 bg-card/70 p-4 shadow-sm">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Channel</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {EQ_CHANNELS.map((channel) => {
              const Icon = CHANNEL_ICONS[channel.id];
              const active = selectedChannel === channel.id;
              return (
                <button
                  key={channel.id}
                  onClick={() => setSelectedChannel(channel.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {channel.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Editing <span className="font-medium text-foreground">{view.selectedChannel.label}</span>.
            Changes stay on this channel and are applied before the mix.
          </p>
        </div>

        <ChannelEqPanel
          key={view.editorTargetChannelId}
          channelId={view.editorTargetChannelId}
          label={view.selectedChannel.label}
        />
      </section>

      <details className="rounded-2xl border border-border/60 bg-card/40">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground">
          Advanced output protection
        </summary>
        <div className="border-t border-border/60 px-4 py-4">
          <DspControls
            dsp={masterDsp}
            title="Master Protection"
            showOutputGain={false}
            showInputGain={false}
            showFilters={false}
            showEqControls={false}
            footerNote="This limiter runs after every channel is summed. It is kept out of the main EQ workflow so the page stays focused on the selected channel."
          />
        </div>
      </details>
    </div>
  );
}
