import type { DspRuntimeConfig } from "../types/audio-engine.ts";

/** The four Audapp channels exposed in the per-channel Equalizer. */
export type EqChannelId = "general" | "music" | "game" | "browser";

export const EQ_CHANNELS: ReadonlyArray<{ id: EqChannelId; label: string }> = [
  { id: "general", label: "General" },
  { id: "music", label: "Music" },
  { id: "game", label: "Game" },
  { id: "browser", label: "Browser" },
] as const;

/** The channel the Equalizer selects on first open. */
export const DEFAULT_EQ_CHANNEL: EqChannelId = "general";

/** Human-facing label for a channel id (falls back to the id itself). */
export function channelLabel(id: string): string {
  return EQ_CHANNELS.find((channel) => channel.id === id)?.label ?? id;
}

/**
 * A fresh, transparent per-channel DSP config. Enabled-by-default so gain/EQ take
 * effect immediately, but every stage is flat (no audible change) until edited.
 * Returns a new object each call so independent channels never share band arrays.
 */
export function defaultChannelDspConfig(): DspRuntimeConfig {
  return {
    enabled: true,
    outputGainDb: 0,
    inputGainDb: 0,
    highPassEnabled: false,
    highPassHz: 80,
    lowPassEnabled: false,
    lowPassHz: 18000,
    limiterEnabled: true,
    eqEnabled: false,
    eqPreset: "flat",
    eqBands: [
      { id: "band_100hz", frequencyHz: 100, gainDb: 0, enabled: true },
      { id: "band_250hz", frequencyHz: 250, gainDb: 0, enabled: true },
      { id: "band_1000hz", frequencyHz: 1000, gainDb: 0, enabled: true },
      { id: "band_4000hz", frequencyHz: 4000, gainDb: 0, enabled: true },
      { id: "band_10000hz", frequencyHz: 10000, gainDb: 0, enabled: true },
    ],
  };
}

/**
 * Immutably set a single EQ band's gain, returning a new config. Manual band
 * edits switch the preset to "custom" (mirrors the backend's preset detection).
 * The input config is never mutated, so editing one channel's config cannot
 * affect another channel's config object.
 */
export function withBandGain(
  config: DspRuntimeConfig,
  bandIndex: number,
  gainDb: number,
): DspRuntimeConfig {
  return {
    ...config,
    eqPreset: "custom",
    eqBands: config.eqBands.map((band, index) =>
      index === bandIndex ? { ...band, gainDb } : band,
    ),
  };
}
