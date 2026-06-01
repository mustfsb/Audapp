import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { useAudioDsp } from "@/lib/use-audio-dsp";

type DspHook = ReturnType<typeof useAudioDsp>;

interface DspControlsProps {
  dsp: DspHook;
  footerNote?: string;
  showInputGain?: boolean;
  showFilters?: boolean;
}

export function DspControls({
  dsp,
  footerNote = "DSP and EQ apply only to Engine Lab streams. They do not affect app audio, channel routing, microphone enhancement, or system output.",
  showInputGain = true,
  showFilters = true,
}: DspControlsProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          DSP / EQ
        </p>
        {dsp.status && (
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              dsp.status.supported
                ? dsp.status.enabled && dsp.status.activeInEngine
                  ? "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30"
                  : "bg-muted text-muted-foreground border-border"
                : "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
            )}
          >
            {!dsp.status.supported
              ? "unsupported"
              : dsp.status.enabled && dsp.status.activeInEngine
                ? "active"
                : "disabled"}
          </Badge>
        )}
      </div>

      <div className="rounded-xl bg-card divide-y divide-border/50">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm">Enable DSP</span>
          <Switch
            checked={dsp.config.enabled}
            onCheckedChange={(checked) => void dsp.commitConfig({ ...dsp.config, enabled: checked })}
            disabled={dsp.isLoading}
          />
        </div>

        <SliderRow
          label="Output gain"
          value={`${dsp.config.outputGainDb > 0 ? "+" : ""}${dsp.config.outputGainDb.toFixed(1)} dB`}
          min={-24}
          max={12}
          step={0.5}
          sliderValue={[dsp.config.outputGainDb]}
          disabled={!dsp.config.enabled || dsp.isLoading}
          onValueChange={([v]) => {
            if (v !== undefined) dsp.setConfig({ ...dsp.config, outputGainDb: v });
          }}
          onValueCommit={([v]) => {
            if (v !== undefined) void dsp.commitConfig({ ...dsp.config, outputGainDb: v });
          }}
        />

        {showInputGain && (
          <SliderRow
            label="Input gain"
            value={`${dsp.config.inputGainDb > 0 ? "+" : ""}${dsp.config.inputGainDb.toFixed(1)} dB`}
            min={-24}
            max={12}
            step={0.5}
            sliderValue={[dsp.config.inputGainDb]}
            disabled={!dsp.config.enabled || dsp.isLoading}
            onValueChange={([v]) => {
              if (v !== undefined) dsp.setConfig({ ...dsp.config, inputGainDb: v });
            }}
            onValueCommit={([v]) => {
              if (v !== undefined) void dsp.commitConfig({ ...dsp.config, inputGainDb: v });
            }}
          />
        )}

        <div className="flex items-center justify-between px-4 py-3">
          <span className="text-sm text-muted-foreground">Output limiter</span>
          <Switch
            size="sm"
            checked={dsp.config.limiterEnabled}
            disabled={!dsp.config.enabled || dsp.isLoading}
            onCheckedChange={(checked) =>
              void dsp.commitConfig({ ...dsp.config, limiterEnabled: checked })
            }
          />
        </div>

        {showFilters && (
          <>
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="w-28 shrink-0 text-sm text-muted-foreground">High-Pass</span>
              <Switch
                size="sm"
                checked={dsp.config.highPassEnabled}
                disabled={!dsp.config.enabled || dsp.isLoading}
                onCheckedChange={(checked) =>
                  void dsp.commitConfig({ ...dsp.config, highPassEnabled: checked })
                }
              />
              <div className="flex flex-1 items-center gap-3">
                <Slider
                  min={20}
                  max={300}
                  step={1}
                  value={[dsp.config.highPassHz]}
                  disabled={!dsp.config.enabled || !dsp.config.highPassEnabled || dsp.isLoading}
                  onValueChange={([v]) => {
                    if (v !== undefined) dsp.setConfig({ ...dsp.config, highPassHz: v });
                  }}
                  onValueCommit={([v]) => {
                    if (v !== undefined) void dsp.commitConfig({ ...dsp.config, highPassHz: v });
                  }}
                />
                <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                  {dsp.config.highPassHz.toFixed(0)} Hz
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-3">
              <span className="w-28 shrink-0 text-sm text-muted-foreground">Low-Pass</span>
              <Switch
                size="sm"
                checked={dsp.config.lowPassEnabled}
                disabled={!dsp.config.enabled || dsp.isLoading}
                onCheckedChange={(checked) =>
                  void dsp.commitConfig({ ...dsp.config, lowPassEnabled: checked })
                }
              />
              <div className="flex flex-1 items-center gap-3">
                <Slider
                  min={4000}
                  max={20000}
                  step={100}
                  value={[dsp.config.lowPassHz]}
                  disabled={!dsp.config.enabled || !dsp.config.lowPassEnabled || dsp.isLoading}
                  onValueChange={([v]) => {
                    if (v !== undefined) dsp.setConfig({ ...dsp.config, lowPassHz: v });
                  }}
                  onValueCommit={([v]) => {
                    if (v !== undefined) void dsp.commitConfig({ ...dsp.config, lowPassHz: v });
                  }}
                />
                <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                  {(dsp.config.lowPassHz / 1000).toFixed(1)} kHz
                </span>
              </div>
            </div>
          </>
        )}

        <div className="flex items-center gap-3 px-4 py-3">
          <span className="w-28 shrink-0 text-sm">EQ Bands</span>
          <Switch
            size="sm"
            checked={dsp.config.eqEnabled}
            disabled={!dsp.config.enabled || dsp.isLoading}
            onCheckedChange={(checked) =>
              void dsp.commitConfig({ ...dsp.config, eqEnabled: checked })
            }
          />
          <Select
            value={dsp.config.eqPreset}
            onValueChange={(v) => void dsp.setPreset(v)}
            disabled={!dsp.config.enabled || !dsp.config.eqEnabled || dsp.isLoading}
          >
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="flat">Flat</SelectItem>
              <SelectItem value="gaming">Gaming</SelectItem>
              <SelectItem value="music">Music</SelectItem>
              <SelectItem value="voice_clarity">Voice Clarity</SelectItem>
              <SelectItem value="bass_boost">Bass Boost</SelectItem>
              {dsp.config.eqPreset === "custom" && (
                <SelectItem value="custom">Custom</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {dsp.config.eqBands.length > 0 && (
          <div className="px-4 py-3">
            <div className="grid grid-cols-5 gap-3">
              {dsp.config.eqBands.map((band, idx) => {
                const label =
                  band.frequencyHz >= 1000
                    ? `${band.frequencyHz / 1000}k`
                    : `${band.frequencyHz}`;
                return (
                  <div key={band.id} className="flex flex-col items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">{label}</span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {band.gainDb > 0 ? "+" : ""}
                      {band.gainDb.toFixed(1)}
                    </span>
                    <Slider
                      min={-12}
                      max={12}
                      step={0.5}
                      value={[band.gainDb]}
                      disabled={!dsp.config.enabled || !dsp.config.eqEnabled || dsp.isLoading}
                      orientation="vertical"
                      className="h-16"
                      onValueChange={([v]) => {
                        if (v === undefined) return;
                        const newBands = dsp.config.eqBands.map((b, i) =>
                          i === idx ? { ...b, gainDb: v } : b,
                        );
                        dsp.setConfig({ ...dsp.config, eqBands: newBands, eqPreset: "custom" });
                      }}
                      onValueCommit={([v]) => {
                        if (v === undefined) return;
                        const newBands = dsp.config.eqBands.map((b, i) =>
                          i === idx ? { ...b, gainDb: v } : b,
                        );
                        void dsp.commitConfig({
                          ...dsp.config,
                          eqBands: newBands,
                          eqPreset: "custom",
                        });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void dsp.reset()}
            disabled={dsp.isLoading}
          >
            Reset to flat
          </Button>
          {dsp.status?.unsupportedReason && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              {dsp.status.unsupportedReason}
            </p>
          )}
          {dsp.error && <p className="text-xs text-destructive">{dsp.error}</p>}
        </div>
      </div>

      {footerNote && <p className="text-xs text-muted-foreground">{footerNote}</p>}
    </section>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  sliderValue,
  disabled,
  onValueChange,
  onValueCommit,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  sliderValue: number[];
  disabled: boolean;
  onValueChange: (values: number[]) => void;
  onValueCommit: (values: number[]) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="w-28 shrink-0 text-sm text-muted-foreground">{label}</span>
      <Slider
        min={min}
        max={max}
        step={step}
        value={sliderValue}
        disabled={disabled}
        onValueChange={onValueChange}
        onValueCommit={onValueCommit}
        className="flex-1"
      />
      <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">{value}</span>
    </div>
  );
}
