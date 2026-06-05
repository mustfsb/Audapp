import type {
  AudappEndpointKind,
  AudappOutputChannelId,
  AudioDiscoveryDevice,
} from "../types/discovery.ts";

import { INTERNAL_CHANNELS } from "./internal-channels.ts";

export type AudappEndpointClass = {
  isAudappEndpoint: boolean;
  kind: AudappEndpointKind | null;
  channelId: AudappOutputChannelId | null;
};

export const AUDAPP_OUTPUT_CHANNEL_IDS: readonly AudappOutputChannelId[] = [
  "general",
  "music",
  "game",
  "browser",
] as const;

const CHANNEL_MATCHERS: ReadonlyArray<readonly [string, AudappOutputChannelId]> = [
  ["audapp general", "general"],
  ["audapp music", "music"],
  ["audapp game", "game"],
  ["audapp browser", "browser"],
];

const CHANNEL_SHORT_LABELS: Record<AudappOutputChannelId, string> = {
  general: "General",
  music: "Music",
  game: "Game",
  browser: "Browser",
};

/**
 * Classify an endpoint by its friendly name. Mirrors the Rust
 * `classify_audapp_endpoint` so the UI works even when a snapshot predates the
 * backend metadata. Matching is lowercased and does not depend on the localized
 * `Hoparlör`/`Mikrofon` prefix.
 */
export function classifyAudappEndpointByName(name: string): AudappEndpointClass {
  const lower = name.toLowerCase();

  for (const [needle, channelId] of CHANNEL_MATCHERS) {
    if (lower.includes(needle)) {
      return { isAudappEndpoint: true, kind: "channel_output", channelId };
    }
  }

  if (lower.includes("audapp input")) {
    return { isAudappEndpoint: true, kind: "input", channelId: null };
  }

  if (lower.includes("audapp multi")) {
    return { isAudappEndpoint: true, kind: "legacy_multi", channelId: null };
  }

  if (lower.includes("audapp")) {
    return { isAudappEndpoint: true, kind: "unknown", channelId: null };
  }

  return { isAudappEndpoint: false, kind: null, channelId: null };
}

/**
 * Resolve the Audapp classification for a discovered device, preferring the
 * backend-provided fields and falling back to name-based classification.
 */
export function getAudappEndpointClass(device: AudioDiscoveryDevice): AudappEndpointClass {
  if (typeof device.isAudappEndpoint === "boolean") {
    return {
      isAudappEndpoint: device.isAudappEndpoint,
      kind: device.isAudappEndpoint ? device.audappEndpointKind ?? "unknown" : null,
      channelId: device.isAudappEndpoint ? device.audappChannelId ?? null : null,
    };
  }

  return classifyAudappEndpointByName(device.name);
}

/** Short, channel-only label used for Devices badges. */
export function audappChannelShortLabel(channelId: AudappOutputChannelId): string {
  return CHANNEL_SHORT_LABELS[channelId];
}

/** A compact badge label for any Audapp endpoint, or null when not Audapp. */
export function audappEndpointBadgeLabel(endpointClass: AudappEndpointClass): string | null {
  if (!endpointClass.isAudappEndpoint) {
    return null;
  }

  switch (endpointClass.kind) {
    case "channel_output":
      return endpointClass.channelId
        ? audappChannelShortLabel(endpointClass.channelId)
        : "Audapp";
    case "input":
      return "Input";
    case "legacy_multi":
      return "Legacy";
    default:
      return "Audapp";
  }
}

export type AudappChannelEndpoint = {
  channelId: AudappOutputChannelId;
  label: string;
  available: boolean;
  deviceId: string | null;
  deviceName: string | null;
  state: AudioDiscoveryDevice["state"] | null;
};

/**
 * Map the four internal output channels to their backing Windows endpoints
 * (if discovered). A channel is "available" only when a matching endpoint is
 * present and active.
 */
export function summarizeAudappChannelEndpoints(
  devices: AudioDiscoveryDevice[],
): AudappChannelEndpoint[] {
  const byChannel = new Map<AudappOutputChannelId, AudioDiscoveryDevice>();

  for (const device of devices) {
    if (device.kind !== "output") {
      continue;
    }

    const endpointClass = getAudappEndpointClass(device);
    if (endpointClass.kind !== "channel_output" || !endpointClass.channelId) {
      continue;
    }

    const existing = byChannel.get(endpointClass.channelId);
    // Prefer an active endpoint when several share a channel.
    if (!existing || (existing.state !== "active" && device.state === "active")) {
      byChannel.set(endpointClass.channelId, device);
    }
  }

  return AUDAPP_OUTPUT_CHANNEL_IDS.map((channelId) => {
    const device = byChannel.get(channelId) ?? null;
    const definition = INTERNAL_CHANNELS.find((channel) => channel.id === channelId);

    return {
      channelId,
      label: definition?.label ?? channelId,
      available: Boolean(device && device.state === "active"),
      deviceId: device?.id ?? null,
      deviceName: device?.name ?? null,
      state: device?.state ?? null,
    };
  });
}
