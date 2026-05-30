import { SlidersHorizontal } from "lucide-react";

import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Equalizer"
        title="Headphone and microphone tone shaping"
        description="Reserve the control surfaces for the DSP layer without implying live signal processing already exists."
        actions={
          <div className="flex items-center gap-3">
            <Badge variant="outline">10 bands</Badge>
            <Select value={preset} onValueChange={(value) => onPresetChange(value as EqPresetName)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presetOptions.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <EqPanel
          title="Headphone EQ"
          description="Shaped for playback monitoring."
          bands={headphoneBands}
          onBandChange={onHeadphoneBandChange}
        />
        <EqPanel
          title="Microphone EQ"
          description="Reserved for mic polish and voice contour."
          bands={microphoneBands}
          onBandChange={onMicrophoneBandChange}
        />
      </div>
    </div>
  );
}

function EqPanel({
  title,
  description,
  bands,
  onBandChange,
}: {
  title: string;
  description: string;
  bands: EqBand[];
  onBandChange: (index: number, value: number) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-5">
        {bands.map((band, index) => (
          <div key={`${title}-${band.label}`} className="rounded-md bg-muted/25 p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium">{band.label}</span>
              <span className="text-xs text-muted-foreground">
                {band.gain > 0 ? `+${band.gain}` : band.gain} dB
              </span>
            </div>
            <Slider
              value={[band.gain]}
              min={-12}
              max={12}
              step={1}
              onValueChange={(values) => onBandChange(index, values[0] ?? band.gain)}
            />
            <p className="mt-3 text-xs text-muted-foreground">{band.frequency} Hz band</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
