import type { AudioDiscoverySession } from "@/types/discovery";
import type { AudioSessionTarget, ChannelAssignmentMatch } from "@/types/session-control";

export function sessionTargetFromDiscovery(
  session: AudioDiscoverySession,
): AudioSessionTarget | null {
  if (!session.deviceId) {
    return null;
  }

  return {
    deviceId: session.deviceId,
    sessionId: session.sessionId,
    sessionInstanceId: session.sessionInstanceId,
    processId: session.processId,
  };
}

export function assignmentMatchFromSession(
  session: AudioDiscoverySession,
): ChannelAssignmentMatch {
  return {
    executablePath: session.executablePath,
    processName: session.processName,
    sessionDisplayName: session.displayName,
    processId: session.processId,
  };
}

export function sessionControlKey(session: AudioDiscoverySession): string {
  return session.id;
}

export function isSessionControllable(session: AudioDiscoverySession): boolean {
  return (
    session.state !== "expired" &&
    Boolean(session.deviceId)
  );
}
