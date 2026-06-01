export type AudioRoutingState =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "error";

export type RoutingConfigInput = {
  captureDeviceId: string;
  renderDeviceId: string;
  requestedBufferMs?: number | null;
};

export type AudioRoutingRuntimeStatus = {
  state: AudioRoutingState;
  captureDeviceId: string | null;
  renderDeviceId: string | null;
  sampleRate: number | null;
  inputChannels: number | null;
  outputChannels: number | null;
  bufferFrames: number | null;
  estimatedLatencyMs: number | null;
  ringFillPercent: number | null;
  underrunCount: number;
  overrunCount: number;
  glitchCount: number;
  peakLevel: number | null;
  rmsLevel: number | null;
  warning: string | null;
  lastError: string | null;
  updatedAt: string;
};
