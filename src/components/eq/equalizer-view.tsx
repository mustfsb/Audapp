import { FlaskConical } from "lucide-react";

import { DspControls } from "@/components/engine/dsp-controls";
import { useAudioDsp } from "@/lib/use-audio-dsp";

export function EqualizerView() {
  const dsp = useAudioDsp();

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Equalizer</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Master DSP applied to the Audapp bridge output stream.
        </p>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl bg-muted/40 px-4 py-3">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Master bridge output DSP.</span> When
            Audapp Routing is active, all DSP controls here (gain, EQ, limiter) are applied to
            the mixed output stream before it reaches your physical speakers.
          </p>
          <p>
            <span className="font-medium text-foreground">Channel gain/mute</span> uses Windows
            session volume controls (see Mixer page).
          </p>
          <p>
            <span className="font-medium text-foreground">Per-channel EQ</span> is not available
            yet — audio is already mixed by the time Audapp captures it. Separated streams are
            required for true per-channel EQ and are a future phase.
          </p>
        </div>
      </div>

      <DspControls
        dsp={dsp}
        showInputGain={false}
        footerNote="DSP is applied to the mixed Audapp bridge output. Master gain and EQ affect all audio passing through the Audapp routing path. Enable DSP and start Audapp Routing in Bridge Lab to hear changes."
      />
    </div>
  );
}
