export type AudioEngineState = "stopped" | "starting" | "running" | "stopping" | "error";

export type AudioEngineMode =
  | "none"
  | "render_silence"
  | "render_test_tone"
  | "capture_meter"
  | "capture_to_null";

export type StartAudioEngineTestInput = {
  mode: Exclude<AudioEngineMode, "none">;
  inputDeviceId?: string | null;
  outputDeviceId?: string | null;
  toneFrequencyHz?: number | null;
  toneGain?: number | null;
};

export type AudioEngineRuntimeStatus = {
  state: AudioEngineState;
  mode: AudioEngineMode;
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  sampleRate: number | null;
  channels: number | null;
  bitsPerSample: number | null;
  bufferFrames: number | null;
  estimatedLatencyMs: number | null;
  peakLevel: number | null;
  rmsLevel: number | null;
  glitchCount: number;
  warning: string | null;
  lastError: string | null;
  updatedAt: string;
};

export type DeviceFormatInfo = {
  deviceId: string;
  deviceName: string;
  kind: "input" | "output";
  sampleRate: number | null;
  channels: number | null;
  bitsPerSample: number | null;
  isFloat: boolean;
};

export type EqBandConfig = {
  id: string;
  frequencyHz: number;
  gainDb: number;
  enabled: boolean;
};

export type DspRuntimeConfig = {
  enabled: boolean;
  outputGainDb: number;
  inputGainDb: number;
  highPassEnabled: boolean;
  highPassHz: number;
  lowPassEnabled: boolean;
  lowPassHz: number;
  limiterEnabled: boolean;
  eqEnabled: boolean;
  eqPreset: string;
  eqBands: EqBandConfig[];
};

/** Full per-channel DSP config: the master DSP config plus a channel id. */
export type ChannelDspConfig = DspRuntimeConfig & {
  channelId: string;
};

export type DspRuntimeStatus = {
  enabled: boolean;
  activeInEngine: boolean;
  supported: boolean;
  unsupportedReason: string | null;
  sampleFormat: string | null;
  configVersion: number;
  lastUpdatedAt: string;
};
