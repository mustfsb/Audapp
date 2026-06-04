import type {
  SessionRouteCapability,
  SessionRouteStatus,
} from "@/types/session-control";
import type { AudioSessionView } from "@/types/session-view";

export function deriveSessionRouteStatus(
  session: Pick<AudioSessionView, "routeIntent">,
  capability: SessionRouteCapability,
): SessionRouteStatus {
  if (capability.perAppSwitchingSupported) {
    return {
      applyStatus: session.routeIntent === "monitor_only" ? "ui_only" : "pending",
      appliedEndpointId: null,
      appliedEndpointName: null,
      lastError: null,
      note:
        capability.supportScope === "process"
          ? "Applies to process/app, not an individual session."
          : "Per-app endpoint routing is experimental.",
    };
  }

  if (session.routeIntent === "monitor_only") {
    return {
      applyStatus: "ui_only",
      appliedEndpointId: null,
      appliedEndpointName: null,
      lastError: null,
      note: "Stored as a UI-only monitoring intent.",
    };
  }

  if (session.routeIntent === "system") {
    return {
      applyStatus: "ui_only",
      appliedEndpointId: null,
      appliedEndpointName: null,
      lastError: null,
      note: "Stored only; follows Windows default output until a safe override API exists.",
    };
  }

  return {
    applyStatus: "unsupported",
    appliedEndpointId: null,
    appliedEndpointName: null,
    lastError: capability.statusReason,
    note: capability.manualFallback,
  };
}

export function formatRouteApplyStatus(status: SessionRouteStatus["applyStatus"]): string {
  switch (status) {
    case "applied":
      return "Applied";
    case "pending":
      return "Pending";
    case "unsupported":
      return "Unsupported";
    case "failed":
      return "Failed";
    case "ui_only":
      return "UI only";
    default:
      return status;
  }
}
