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
          Shared DSP config for Engine Lab and Routing Lab (not system-wide audio).
        </p>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl bg-muted/40 px-4 py-3">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">Not system-wide EQ.</span> Changes apply
            to Engine Lab test streams and to Routing Lab when manual routing is running.
          </p>
          <p>Automatic per-app routing is not available yet.</p>
          <p>Noise suppression is not active yet.</p>
          <p className="pt-1">
            Use <span className="font-medium text-foreground">Routing Lab</span> with a virtual cable,
            or <span className="font-medium text-foreground">Render Test Tone</span> in Engine Lab,
            to hear EQ changes.
          </p>
        </div>
      </div>

      <DspControls
        dsp={dsp}
        showInputGain={false}
        footerNote="Changes apply to the shared DSP config used by Engine Lab and Routing Lab. This does not affect other apps unless you route audio into Routing Lab manually."
      />
    </div>
  );
}
