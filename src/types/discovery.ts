export type AudioDiscoveryDeviceKind = "input" | "output";

export type AudioDiscoveryDeviceState =
  | "active"
  | "disabled"
  | "not_present"
  | "unplugged"
  | "unknown";

export type AudioDiscoverySessionState =
  | "active"
  | "inactive"
  | "expired"
  | "unknown";

export type AudioDiscoverySource = "windows-core-audio" | "mock" | "unavailable";

export type AudioDiscoveryLoadState = "ready" | "loading" | "error" | "empty";

export type AudappEndpointKind =
  | "input"
  | "channel_output"
  | "legacy_multi"
  | "unknown";

export type AudappOutputChannelId = "general" | "music" | "game" | "browser";

export type AudioDiscoveryDevice = {
  id: string;
  name: string;
  kind: AudioDiscoveryDeviceKind;
  state: AudioDiscoveryDeviceState;
  isDefault: boolean;
  /** True when this endpoint belongs to any Audapp driver. */
  isAudappEndpoint?: boolean;
  /** Endpoint role, or null/undefined for non-Audapp endpoints. */
  audappEndpointKind?: AudappEndpointKind | null;
  /** Internal output channel id for AudappChannels outputs; null otherwise. */
  audappChannelId?: AudappOutputChannelId | null;
};

export type AudioDiscoverySession = {
  id: string;
  sessionId: string | null;
  sessionInstanceId: string | null;
  groupingParam?: string | null;
  displayName: string;
  processId: number | null;
  processName: string | null;
  executablePath: string | null;
  appUserModelId?: string | null;
  packageFullName?: string | null;
  packageFamilyName?: string | null;
  deviceId: string | null;
  state: AudioDiscoverySessionState;
  volume: number | null;
  muted: boolean | null;
  isSystemSounds: boolean;
};

export type AudioDiscoveryStatus = {
  source: AudioDiscoverySource;
  state: AudioDiscoveryLoadState;
  warnings: string[];
  refreshedAt: string | null;
  deviceCount: number;
  sessionCount: number;
};

export type AudioDiscoverySnapshot = {
  devices: AudioDiscoveryDevice[];
  sessions: AudioDiscoverySession[];
  status: AudioDiscoveryStatus;
};
