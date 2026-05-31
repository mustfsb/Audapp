import { Mic2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";

interface NoiseViewProps {
  enabled: boolean;
  strength: number;
  inputGain: number;
  gateThreshold: number;
  previewLevel: number;
  onEnabledChange: (value: boolean) => void;
  onStrengthChange: (value: number) => void;
  onInputGainChange: (value: number) => void;
  onGateThresholdChange: (value: number) => void;
}

export function NoiseView({
  enabled,
  strength,
  inputGain,
  gateThreshold,
  onEnabledChange,
  onStrengthChange,
  onInputGainChange,
  onGateThresholdChange,
}: NoiseViewProps) {
  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Noise Suppression</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Microphone cleanup.</p>
      </div>

      {/* Not-active callout */}
      <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/40 px-4 py-3">
        <Mic2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Not implemented yet.</span>{" "}
          These controls are placeholders. Real noise suppression is planned for a future phase.
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Controls</CardTitle>
            <Switch checked={enabled} onCheckedChange={onEnabledChange} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <SliderRow label="Strength" value={`${strength}%`} current={strength} onChange={onStrengthChange} />
          <SliderRow label="Input gain" value={`${inputGain}%`} current={inputGain} onChange={onInputGainChange} />
          <SliderRow label="Gate threshold" value={`${gateThreshold}%`} current={gateThreshold} onChange={onGateThresholdChange} />
        </CardContent>
      </Card>
    </div>
  );
}

function SliderRow({
  label,
  value,
  current,
  onChange,
}: {
  label: string;
  value: string;
  current: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-sm text-muted-foreground">{label}</span>
      <Slider
        value={[current]}
        max={100} step={1}
        onValueChange={(values) => onChange(values[0] ?? current)}
        className="flex-1"
      />
      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{value}</span>
    </div>
  );
}
