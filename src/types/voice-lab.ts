export type VoiceLabState = "stopped" | "starting" | "running" | "stopping" | "error";

export interface VoiceDevice {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface VoiceLabSettings {
  inputDeviceId: string | null;
  monitorDeviceId: string | null;
  inputGainDb: number;
  highPassEnabled: boolean;
  highPassHz: number;
  gateEnabled: boolean;
  gateThresholdDb: number;
  gateReleaseMs: number;
  limiterEnabled: boolean;
  monitorEnabled: boolean;
}

export interface VoiceLabStatus {
  running: boolean;
  state: VoiceLabState;
  rawPeak: number;
  rawRms: number;
  processedPeak: number;
  processedRms: number;
  gateOpen: boolean;
  inputFormat: string | null;
  monitorOutputFormat: string | null;
  lastError: string | null;
  updatedAt: string;
}

export const DEFAULT_VOICE_SETTINGS: VoiceLabSettings = {
  inputDeviceId: null,
  monitorDeviceId: null,
  inputGainDb: 0,
  highPassEnabled: true,
  highPassHz: 80,
  gateEnabled: false,
  gateThresholdDb: -40,
  gateReleaseMs: 100,
  limiterEnabled: true,
  monitorEnabled: false,
};

export const STOPPED_VOICE_STATUS: VoiceLabStatus = {
  running: false,
  state: "stopped",
  rawPeak: 0,
  rawRms: 0,
  processedPeak: 0,
  processedRms: 0,
  gateOpen: false,
  inputFormat: null,
  monitorOutputFormat: null,
  lastError: null,
  updatedAt: new Date().toISOString(),
};
