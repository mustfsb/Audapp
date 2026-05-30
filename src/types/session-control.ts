import type { AudioDiscoverySnapshot } from "@/types/discovery";

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

export type AudioSessionControlResult = {
  ok: boolean;
  target: AudioSessionTarget;
  requestedVolume?: number;
  requestedMuted?: boolean;
  message?: string;
  warning?: string | null;
  snapshot?: AudioDiscoverySnapshot | null;
};

export type SetAudioSessionVolumeInput = {
  target: AudioSessionTarget;
  volumePercent: number;
};

export type SetAudioSessionMuteInput = {
  target: AudioSessionTarget;
  muted: boolean;
};

export type SetChannelAssignmentInput = {
  channelId: string;
  match: ChannelAssignmentMatch;
  label: string;
};

export type RemoveChannelAssignmentInput = {
  assignmentId: string;
};
