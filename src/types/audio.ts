export type SectionId =
  | "dashboard"
  | "mixer"
  | "apps"
  | "devices"
  | "equalizer"
  | "noise"
  | "profiles"
  | "settings"
  | "engine"
  | "routing"
  | "bridge";

export type LatencyMode = "Ultra Low" | "Balanced" | "Stable";
export type DeviceKind = "input" | "output";
export type DeviceHealth = "Healthy" | "Attention" | "Offline";
export type SessionState = "Foreground" | "Background" | "Idle";
export type EqPresetName =
  | "Flat"
  | "Gaming"
  | "Music"
  | "Voice Clarity"
  | "Bass Boost";

export interface AudioDevice {
  id: string;
  name: string;
  kind: DeviceKind;
  connection: string;
  isDefault: boolean;
  sampleRate: number;
  bitDepth: number;
  health: DeviceHealth;
  channels: string;
  latencyMs: number;
}

export interface AudioChannel {
  id: string;
  name: string;
  description?: string;
  bucket: "general" | "music" | "voice" | "game";
  volume: number;
  muted: boolean;
  solo: boolean;
  outputDeviceId: string;
  peak: number;
  meterHold: number;
}

export interface AppAudioSession {
  id: string;
  name: string;
  process: string;
  channelId: string;
  volume: number;
  outputDeviceId: string;
  state: SessionState;
}

export interface EqBand {
  frequency: number;
  label: string;
  gain: number;
}

export interface AudioProfile {
  id: string;
  name: string;
  description: string;
  latencyMode: LatencyMode;
  focus: string;
  active: boolean;
}

export interface EngineStatus {
  state: "Mock Ready" | "Attention Needed";
  latencyMode: LatencyMode;
  cpuLoad: number;
  audioLoad: number;
  warnings: string[];
}

export interface NoiseSuppressionState {
  enabled: boolean;
  strength: number;
  inputGain: number;
  gateThreshold: number;
  previewLevel: number;
}

export interface AppSettings {
  startupBehavior: boolean;
  trayBehavior: boolean;
  latencyMode: LatencyMode;
  telemetryEnabled: boolean;
  driverState: string;
}
