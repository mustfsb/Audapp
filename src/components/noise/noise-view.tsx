import { Mic2, RadioTower } from "lucide-react";

import { SectionHeader } from "@/components/layout/section-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
  previewLevel,
  onEnabledChange,
  onStrengthChange,
  onInputGainChange,
  onGateThresholdChange,
}: NoiseViewProps) {
  const previewBars = Array.from({ length: 18 }, (_, index) => Math.max(12, ((index % 6) + 1) * 10 + (enabled ? 8 : 0)));

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Noise suppression"
        title="Microphone cleanup surface"
        description="Tune placeholder suppression values now so the control contract is stable when the real signal chain arrives."
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Suppression controls</CardTitle>
                <CardDescription>These controls are UI-only in Phase 1.</CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={enabled ? "default" : "outline"}>{enabled ? "Enabled" : "Disabled"}</Badge>
                <Switch checked={enabled} onCheckedChange={onEnabledChange} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6">
            <ControlRow label="Strength" value={`${strength}%`} onChange={onStrengthChange} current={strength} />
            <ControlRow label="Input gain" value={`${inputGain}%`} onChange={onInputGainChange} current={inputGain} />
            <ControlRow label="Gate threshold" value={`${gateThreshold}%`} onChange={onGateThresholdChange} current={gateThreshold} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <RadioTower className="size-4 text-muted-foreground" />
              <div>
                <CardTitle>Live preview placeholder</CardTitle>
                <CardDescription>Simulated input energy with no real DSP processing.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid h-36 grid-cols-9 items-end gap-2 rounded-md bg-muted/35 p-4">
              {previewBars.map((value, index) => (
                <div
                  key={`${value}-${index}`}
                  className="rounded-full bg-primary/70"
                  style={{ height: `${Math.min(100, value + previewLevel / 3)}%` }}
                />
              ))}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Preview level</span>
                <span>{previewLevel}%</span>
              </div>
              <Progress value={previewLevel} />
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mic2 className="size-3.5" />
              Live preview is visual-only until the Windows audio stack is implemented.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ControlRow({
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
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <Slider value={[current]} max={100} step={1} onValueChange={(values) => onChange(values[0] ?? current)} />
    </div>
  );
}
