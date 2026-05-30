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
