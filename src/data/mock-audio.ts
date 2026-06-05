import type {
  AppAudioSession,
  AppSettings,
  AudioChannel,
  AudioDevice,
  AudioProfile,
  EngineStatus,
  EqBand,
  EqPresetName,
  NoiseSuppressionState,
} from "@/types/audio";
import { createInternalAudioChannels } from "@/lib/internal-channels";

const bandLabels = ["31", "62", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];

function buildEqBands(values: number[]): EqBand[] {
  return bandLabels.map((label, index) => ({
    frequency: Number.parseInt(label, 10),
    label,
    gain: values[index] ?? 0,
  }));
}

export const eqPresetValues: Record<EqPresetName, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Gaming: [1, 2, 1, 0, -1, 2, 3, 2, 1, 0],
  Music: [2, 3, 2, 1, 0, 1, 2, 1, 2, 2],
  "Voice Clarity": [-1, 0, 1, 2, 3, 3, 2, 1, 0, -1],
  "Bass Boost": [4, 5, 4, 2, 1, 0, -1, -1, 0, 1],
};

export const mockDevices: AudioDevice[] = [
  {
    id: "out-1",
    name: "SteelSeries Arctis Nova Pro",
    kind: "output",
    connection: "USB",
    isDefault: true,
    sampleRate: 48000,
    bitDepth: 24,
    health: "Healthy",
    channels: "2.0 Stereo",
    latencyMs: 13,
  },
  {
    id: "out-2",
    name: "LG UltraGear Display Audio",
    kind: "output",
    connection: "HDMI",
    isDefault: false,
    sampleRate: 48000,
    bitDepth: 24,
    health: "Healthy",
    channels: "2.0 Stereo",
    latencyMs: 21,
  },
  {
    id: "out-3",
    name: "Creative Pebble Plus",
    kind: "output",
    connection: "3.5 mm",
    isDefault: false,
    sampleRate: 44100,
    bitDepth: 16,
    health: "Attention",
    channels: "2.0 Stereo",
    latencyMs: 28,
  },
  {
    id: "in-1",
    name: "Shure MV7",
    kind: "input",
    connection: "USB",
    isDefault: true,
    sampleRate: 48000,
    bitDepth: 24,
    health: "Healthy",
    channels: "Mono",
    latencyMs: 7,
  },
  {
    id: "in-2",
    name: "Logitech BRIO Mic",
    kind: "input",
    connection: "USB",
    isDefault: false,
    sampleRate: 48000,
    bitDepth: 16,
    health: "Attention",
    channels: "Stereo",
    latencyMs: 16,
  },
];

export const mockChannels: AudioChannel[] = createInternalAudioChannels("out-1");

export const mockSessions: AppAudioSession[] = [
  { id: "chrome", name: "Chrome", process: "chrome.exe", channelId: "browser", volume: 62, outputDeviceId: "out-1", state: "Foreground" },
  { id: "discord", name: "Discord", process: "discord.exe", channelId: "general", volume: 70, outputDeviceId: "out-2", state: "Foreground" },
  { id: "spotify", name: "Spotify", process: "spotify.exe", channelId: "music", volume: 74, outputDeviceId: "out-3", state: "Background" },
  { id: "steam", name: "Steam", process: "steam.exe", channelId: "general", volume: 38, outputDeviceId: "out-1", state: "Idle" },
  { id: "game", name: "GameClient.exe", process: "gameclient.exe", channelId: "game", volume: 81, outputDeviceId: "out-1", state: "Foreground" },
];

export const mockProfiles: AudioProfile[] = [
  { id: "gaming", name: "Gaming", description: "Focus on low-latency output routing and chat balance.", latencyMode: "Ultra Low", focus: "FPS routing", active: true },
  { id: "streaming", name: "Streaming", description: "Stabilize mic treatment and isolate browser audio.", latencyMode: "Balanced", focus: "Broadcast mix", active: false },
  { id: "meeting", name: "Meeting", description: "Favor voice clarity and calm device switching.", latencyMode: "Stable", focus: "Communication", active: false },
  { id: "music", name: "Music", description: "Lift headphone EQ and keep the mixer uncluttered.", latencyMode: "Balanced", focus: "Listening", active: false },
];

export const mockEngineStatus: EngineStatus = {
  state: "Mock Ready",
  latencyMode: "Balanced",
  cpuLoad: 22,
  audioLoad: 36,
  warnings: [
    "Session routing is mocked for Phase 1 only.",
    "Secondary speaker output reports higher latency than target.",
  ],
};

export const mockSettings: AppSettings = {
  startupBehavior: true,
  trayBehavior: true,
  latencyMode: "Balanced",
  telemetryEnabled: false,
  driverState: "No driver required in Phase 1",
};

export const mockNoiseSuppression: NoiseSuppressionState = {
  enabled: true,
  strength: 58,
  inputGain: 64,
  gateThreshold: 42,
  previewLevel: 61,
};

export const mockHeadphoneEq = buildEqBands(eqPresetValues.Flat);
export const mockMicrophoneEq = buildEqBands(eqPresetValues["Voice Clarity"]);
