import type { AudioChannel } from "../types/audio.ts";

export type InternalChannelId = "general" | "music" | "game" | "browser";

export type InternalChannelDefinition = {
  id: InternalChannelId;
  label: string;
  description: string;
  defaultVolume: number;
  bucket: AudioChannel["bucket"];
};

export const DEFAULT_INTERNAL_CHANNEL_ID: InternalChannelId = "general";

export const INTERNAL_CHANNELS: InternalChannelDefinition[] = [
  {
    id: "general",
    label: "Audapp General",
    description: "Default internal Audapp group for everyday apps and anything unassigned.",
    defaultVolume: 72,
    bucket: "general",
  },
  {
    id: "music",
    label: "Audapp Music",
    description: "Internal Audapp group for music and listening-focused sessions.",
    defaultVolume: 74,
    bucket: "music",
  },
  {
    id: "game",
    label: "Audapp Game",
    description: "Internal Audapp group for games and immersive app audio.",
    defaultVolume: 80,
    bucket: "game",
  },
  {
    id: "browser",
    label: "Audapp Browser",
    description: "Internal Audapp group for browser and web audio (Chrome, Edge, Firefox).",
    defaultVolume: 70,
    bucket: "browser",
  },
] as const;

export function isInternalChannelId(value: string | null | undefined): value is InternalChannelId {
  return INTERNAL_CHANNELS.some((channel) => channel.id === value);
}

export function getInternalChannelById(
  channelId: string | null | undefined,
): InternalChannelDefinition | null {
  return INTERNAL_CHANNELS.find((channel) => channel.id === channelId) ?? null;
}

export function createInternalAudioChannels(defaultOutputDeviceId: string): AudioChannel[] {
  return INTERNAL_CHANNELS.map((channel) => ({
    id: channel.id,
    name: channel.label,
    description: channel.description,
    bucket: channel.bucket,
    volume: channel.defaultVolume,
    muted: false,
    solo: false,
    outputDeviceId: defaultOutputDeviceId,
    peak: Math.min(100, channel.defaultVolume + 6),
    meterHold: Math.min(100, channel.defaultVolume + 12),
  }));
}
