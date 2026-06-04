// ---- Existing audio engine routing types ----

export type RoutingState = "stopped" | "starting" | "running" | "stopping" | "error";

export interface RoutingConfigInput {
  captureDeviceId: string;
  renderDeviceId: string;
  requestedBufferMs?: number | null;
}

export interface AudioRoutingRuntimeStatus {
  state: RoutingState;
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
}

// ---- Phase 17A: Audapp system routing status ----

export interface RoutingStatus {
  routingEnabled: boolean;
  currentDefaultRenderId: string | null;
  currentDefaultRenderName: string | null;
  previousDefaultRenderId: string | null;
  previousDefaultRenderName: string | null;
  audappRenderId: string | null;
  audappRenderName: string | null;
  selectedOutputId: string | null;
  selectedOutputName: string | null;
  bridgeRunning: boolean;
  restoreAvailable: boolean;
  lastError: string | null;
}
