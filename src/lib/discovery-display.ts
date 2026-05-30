import type {
  AudioDiscoveryDevice,
  AudioDiscoverySession,
  AudioDiscoveryStatus,
} from "@/types/discovery";

export function formatDiscoveryRefreshTime(refreshedAt: string | null): string {
  if (!refreshedAt) {
    return "Not refreshed yet";
  }

  const date = new Date(refreshedAt);
  if (Number.isNaN(date.getTime())) {
    return refreshedAt;
  }

  return date.toLocaleString();
}

export function sessionProcessLabel(session: AudioDiscoverySession): string {
  if (session.processName) {
    return session.processName;
  }

  if (session.processId !== null) {
    return `PID ${session.processId}`;
  }

  if (session.isSystemSounds) {
    return "System Sounds";
  }

  return "Unknown process";
}

export function sessionDisplayLabel(session: AudioDiscoverySession): string {
  if (session.displayName.trim()) {
    return session.displayName;
  }

  return sessionProcessLabel(session);
}

export function sessionVolumePercent(session: AudioDiscoverySession): number | null {
  if (session.volume === null) {
    return null;
  }

  return Math.round(session.volume);
}

export function deviceStateLabel(state: AudioDiscoveryDevice["state"]): string {
  switch (state) {
    case "active":
      return "Active";
    case "disabled":
      return "Disabled";
    case "not_present":
      return "Not present";
    case "unplugged":
      return "Unplugged";
    default:
      return "Unknown";
  }
}

export function discoveryStatusLabel(source: AudioDiscoveryStatus): string {
  if (source.source === "windows-core-audio" && source.state === "ready") {
    return "Windows discovery ready";
  }

  if (source.state === "loading") {
    return "Discovering audio…";
  }

  if (source.state === "empty") {
    return "No devices or sessions found";
  }

  if (source.state === "error") {
    return "Discovery error";
  }

  return "Discovery status";
}
