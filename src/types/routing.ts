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
  audappDefaultRenderId: string | null;
  audappDefaultRenderName: string | null;
  selectedOutputId: string | null;
  selectedOutputName: string | null;
  bridgeRunning: boolean;
  bridgeState: RoutingState;
  autoStarted: boolean;
  restoreAvailable: boolean;
  lastError: string | null;
}

export interface SavedOutputDevicePreference {
  endpointId: string;
  name: string;
  lastSeenAt: string;
}

export interface OutputPreferencesStatus {
  primaryOutput: SavedOutputDevicePreference | null;
  fallbackOutput: SavedOutputDevicePreference | null;
  resolvedOutputId: string | null;
  resolvedOutputName: string | null;
  resolutionReason: string | null;
  resolutionMessage: string | null;
}
