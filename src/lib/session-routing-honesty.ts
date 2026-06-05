import type { ResolvedInternalChannel } from "@/lib/channel-workflow";
import type { AudioDiscoveryDevice } from "@/types/discovery";
import type { AudioSessionView } from "@/types/session-view";

export type SessionRoutingHonesty = {
  requestedChannelLabel: string;
  actualEndpointLabel: string;
  actualEndpointKnown: boolean;
};

export function summarizeSessionRoutingHonesty(
  session: Pick<AudioSessionView, "deviceId" | "routeStatus">,
  resolvedChannel: Pick<ResolvedInternalChannel, "channel">,
  outputDevices: AudioDiscoveryDevice[],
): SessionRoutingHonesty {
  return {
    requestedChannelLabel: resolvedChannel.channel.label,
    actualEndpointLabel: resolveActualWindowsEndpointLabel(session, outputDevices),
    actualEndpointKnown: Boolean(
      session.routeStatus?.appliedEndpointName ??
        (session.deviceId && outputDevices.some((device) => device.id === session.deviceId)),
    ),
  };
}

export function resolveActualWindowsEndpointLabel(
  session: Pick<AudioSessionView, "deviceId" | "routeStatus">,
  outputDevices: AudioDiscoveryDevice[],
): string {
  if (session.routeStatus?.appliedEndpointName) {
    return session.routeStatus.appliedEndpointName;
  }

  if (session.deviceId) {
    const device = outputDevices.find((candidate) => candidate.id === session.deviceId);
    if (device) {
      return device.name;
    }
  }

  return "Unknown Windows endpoint";
}
