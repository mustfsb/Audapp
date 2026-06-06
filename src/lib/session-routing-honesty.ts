import type { ResolvedInternalChannel } from "@/lib/channel-workflow";
import type { AudappOutputChannelId, AudioDiscoveryDevice } from "@/types/discovery";
import type { AudioSessionView } from "@/types/session-view";

export type SessionRoutingHonesty = {
  requestedChannelLabel: string;
  actualEndpointLabel: string;
  actualEndpointKnown: boolean;
};

export type RoutingMatchStatus = {
  /** True when the actual Windows endpoint is the requested Audapp channel. */
  matches: boolean;
  status: "ok" | "warning" | "info" | "neutral";
  statusLabel: string;
  /** Short user-facing guidance, or null when no action is needed. */
  helperText: string | null;
};

/**
 * Compare the requested Audapp channel against the actual Windows endpoint and
 * describe the gap in product language. This never claims an automatic move
 * happened — when they differ, it tells the user to switch the output in the
 * Windows Volume Mixer.
 */
export function summarizeRoutingMatch(
  requestedChannelId: AudappOutputChannelId,
  honesty: SessionRoutingHonesty,
): RoutingMatchStatus {
  if (!honesty.actualEndpointKnown) {
    return {
      matches: false,
      status: "neutral",
      statusLabel: "Output unknown",
      helperText: null,
    };
  }

  const actual = honesty.actualEndpointLabel.toLowerCase();

  if (actual.includes(`audapp ${requestedChannelId}`)) {
    return {
      matches: true,
      status: "ok",
      statusLabel: `Routed to ${honesty.requestedChannelLabel}`,
      helperText: null,
    };
  }

  if (actual.includes("audapp")) {
    return {
      matches: false,
      status: "warning",
      statusLabel: "Manual move needed",
      helperText: `Set this app's output to ${honesty.requestedChannelLabel} in Windows Volume Mixer to match.`,
    };
  }

  return {
    matches: false,
    status: "info",
    statusLabel: "Not on Audapp",
    helperText: "This app is playing on a non-Audapp output.",
  };
}

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
