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

export function sessionRouteIntentKeyFromTarget(target: AudioSessionTarget): string {
  const deviceId = target.deviceId.trim();
  if (!deviceId) {
    throw new Error("Session route intent requires a deviceId.");
  }

  const sessionId = target.sessionId?.trim() ?? "";
  const sessionInstanceId = target.sessionInstanceId?.trim() ?? "";
  const processId = target.processId;

  if (!sessionId && !sessionInstanceId && (processId === undefined || processId === null)) {
    throw new Error(
      "Session route intent requires a sessionId, sessionInstanceId, or processId.",
    );
  }

  return [
    deviceId,
    sessionId || "-",
    sessionInstanceId || "-",
    processId === undefined || processId === null ? "-" : String(processId),
  ].join("::");
}

export function sessionRouteIntentKeyFromDiscovery(
  session: AudioDiscoverySession,
): string | null {
  const target = sessionTargetFromDiscovery(session);
  if (!target) {
    return null;
  }

  try {
    return sessionRouteIntentKeyFromTarget(target);
  } catch {
    return null;
  }
}

export function isSessionControllable(session: AudioDiscoverySession): boolean {
  return (
    session.state !== "expired" &&
    Boolean(session.deviceId)
  );
}
