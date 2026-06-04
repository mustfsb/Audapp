export type BridgeState = "stopped" | "starting" | "running" | "stopping" | "error";

export type BridgeMode = "capture_only" | "passthrough" | "resampled_passthrough" | "format_mismatch" | "error";

export interface BridgeCandidate {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface BridgeCandidates {
  audappRender: BridgeCandidate | null;
  physicalOutputs: BridgeCandidate[];
  audappCapture: BridgeCandidate | null;
}

export interface StreamStats {
  active: boolean;
  initializeOk: boolean;
  startOk: boolean;
  packetsRead: number;
  framesRead: number;
  bytesRead: number;
  silenceCount: number;
  peak: number;
  rms: number;
  lastError: string | null;
}

export interface OutputStats {
  active: boolean;
  initializeOk: boolean;
  startOk: boolean;
  framesWritten: number;
  bytesWritten: number;
  underruns: number;
  lastError: string | null;
}

export interface BridgePocStatus {
  running: boolean;
  state: BridgeState;
  mode: BridgeMode;
  audappRenderId: string | null;
  audappRenderName: string | null;
  audappCaptureId: string | null;
  monitorOutputId: string | null;
  monitorOutputName: string | null;
  inputFormat: string | null;
  outputFormat: string | null;
  resamplerActive: boolean;
  resamplerRatio: number;
  pendingFrames: number;
  droppedFrames: number;
  captureDiscontinuityCount: number;
  renderBufferFrames: number;
  renderPaddingFrames: number;
  bufferFillMs: number;
  targetBufferMs: number;
  primedFrames: number;
  startedAt: string | null;
  renderLoopback: StreamStats;
  captureRead: StreamStats;
  monitorOutput: OutputStats;
  lastError: string | null;
  updatedAt: string;
  dspEnabled: boolean;
  postDspPeak: number;
  postDspRms: number;
}

export interface BridgePocConfig {
  audappRenderEndpointId: string | null;
  audappCaptureEndpointId: string | null;
  monitorOutputEndpointId: string | null;
  enableRenderLoopbackCapture: boolean;
  enableCaptureEndpointRead: boolean;
  enablePhysicalMonitorOutput: boolean;
}
