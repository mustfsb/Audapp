import { FlaskConical, SlidersHorizontal } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import type { EqBand, EqPresetName } from "@/types/audio";

interface EqualizerViewProps {
  preset: EqPresetName;
  presetOptions: EqPresetName[];
  headphoneBands: EqBand[];
  microphoneBands: EqBand[];
  onPresetChange: (preset: EqPresetName) => void;
  onHeadphoneBandChange: (index: number, value: number) => void;
  onMicrophoneBandChange: (index: number, value: number) => void;
}

export function EqualizerView({
  preset,
  presetOptions,
  headphoneBands,
  microphoneBands,
  onPresetChange,
  onHeadphoneBandChange,
  onMicrophoneBandChange,
}: EqualizerViewProps) {
  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Equalizer</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Headphone and microphone tone shaping.
          </p>
        </div>
        <Select value={preset} onValueChange={(v) => onPresetChange(v as EqPresetName)}>
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {presetOptions.map((item) => (
              <SelectItem key={item} value={item}>{item}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Not-wired callout */}
      <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-4 py-3">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Not wired to real DSP yet.</span>{" "}
          These controls are visual only. For test-only EQ processing, use{" "}
          <span className="font-medium text-foreground">Audio Engine Lab</span>.
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <EqPanel
          title="Headphone EQ"
          bands={headphoneBands}
          onBandChange={onHeadphoneBandChange}
        />
        <EqPanel
          title="Microphone EQ"
          bands={microphoneBands}
          onBandChange={onMicrophoneBandChange}
        />
      </div>
    </div>
  );
}

function EqPanel({
  title,
  bands,
  onBandChange,
}: {
  title: string;
  bands: EqBand[];
  onBandChange: (index: number, value: number) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 gap-3 2xl:grid-cols-5">
          {bands.map((band, index) => (
            <div key={`${title}-${band.label}`} className="flex flex-col items-center gap-2">
              <span className="text-[10px] text-muted-foreground">{band.label}</span>
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {band.gain > 0 ? `+${band.gain}` : band.gain}
              </span>
              <Slider
                value={[band.gain]}
                min={-12} max={12} step={1}
                orientation="vertical"
                className="h-20"
                onValueChange={(values) => onBandChange(index, values[0] ?? band.gain)}
              />
              <span className="text-[10px] text-muted-foreground">{band.frequency}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
