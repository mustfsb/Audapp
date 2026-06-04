import type { AudioDiscoverySnapshot } from "@/types/discovery";

export type SessionRouteIntent =
  | "system"
  | "audapp"
  | "bypass"
  | "monitor_only";

export type SessionRouteApplyStatus =
  | "applied"
  | "pending"
  | "unsupported"
  | "failed"
  | "ui_only";

export type SessionRouteStatus = {
  applyStatus: SessionRouteApplyStatus;
  appliedEndpointId: string | null;
  appliedEndpointName: string | null;
  lastError: string | null;
  note: string | null;
};

export type SessionRouteCapability = {
  perAppSwitchingSupported: boolean;
  supportScope: "unsupported" | "process" | "session";
  statusReason: string;
  manualFallback: string;
  inspectedStorage: string | null;
};

export type AudioSessionTarget = {
  deviceId: string;
  sessionId: string | null;
  sessionInstanceId?: string | null;
  processId?: number | null;
};

export type ChannelAssignmentMatch = {
  processName?: string | null;
  executablePath?: string | null;
  processId?: number | null;
  sessionDisplayName?: string | null;
};

export type ChannelAssignment = {
  id: string;
  channelId: string;
  match: ChannelAssignmentMatch;
  label: string;
  createdAt: string;
  updatedAt: string;
};

export type ChannelRuleMatchType =
  | "process_contains"
  | "process_equals"
  | "session_name_contains";

export type ChannelRule = {
  id: string;
  enabled: boolean;
  matchType: ChannelRuleMatchType;
  pattern: string;
  channelId: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
};

export type AudioSessionControlResult = {
  ok: boolean;
  target: AudioSessionTarget;
  requestedVolume?: number;
  requestedMuted?: boolean;
  message?: string;
  warning?: string | null;
  snapshot?: AudioDiscoverySnapshot | null;
};

export type SessionRouteIntentEntry = {
  sessionKey: string;
  intent: SessionRouteIntent;
  updatedAt: string;
};

export type SetAudioSessionVolumeInput = {
  target: AudioSessionTarget;
  volumePercent: number;
};

export type SetAudioSessionMuteInput = {
  target: AudioSessionTarget;
  muted: boolean;
};

export type SetSessionRouteIntentInput = {
  target: AudioSessionTarget;
  intent: SessionRouteIntent;
};

export type ClearSessionRouteIntentInput = {
  target: AudioSessionTarget;
};

export type SetChannelAssignmentInput = {
  channelId: string;
  match: ChannelAssignmentMatch;
  label: string;
};

export type RemoveChannelAssignmentInput = {
  assignmentId: string;
};
