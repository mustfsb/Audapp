import type { AudioDiscoveryDevice } from "../types/discovery.ts";
import type {
  OutputPreferencesStatus,
  SavedOutputDevicePreference,
} from "../types/routing.ts";
import { getAudappEndpointClass } from "./audapp-endpoints.ts";

type PreferenceState = {
  primary: Pick<SavedOutputDevicePreference, "endpointId" | "name"> | null;
  fallback: Pick<SavedOutputDevicePreference, "endpointId" | "name"> | null;
};

type PreferenceBadge = "Primary" | "Fallback" | null;

type ResolutionState = PreferenceState & {
  resolvedOutputName: string | null;
  resolutionReason: OutputPreferencesStatus["resolutionReason"];
};

export function isEligiblePreferredOutput(device: AudioDiscoveryDevice): boolean {
  return (
    device.kind === "output" &&
    device.state === "active" &&
    !getAudappEndpointClass(device).isAudappEndpoint
  );
}

export function buildOutputPreferenceViewModel(
  devices: AudioDiscoveryDevice[],
  preferences: PreferenceState,
) {
  return {
    summary: {
      primaryLabel: preferences.primary?.name ?? "Not set",
      fallbackLabel: preferences.fallback?.name ?? "Not set",
    },
    devices: devices
      .filter((device) => device.kind === "output")
      .map((device) => ({
        ...device,
        badge: (
          preferences.primary?.endpointId === device.id
            ? "Primary"
            : preferences.fallback?.endpointId === device.id
              ? "Fallback"
              : null
        ) as PreferenceBadge,
        eligible: isEligiblePreferredOutput(device),
      })),
  };
}

export function deriveOutputPreferenceStatus(input: ResolutionState) {
  if (input.resolutionReason === "fallback" && input.resolvedOutputName) {
    return {
      message: `Primary output not found. Using fallback: ${input.resolvedOutputName}.`,
    };
  }

  if (input.resolutionReason === "auto" && input.resolvedOutputName) {
    return {
      message: `Preferred outputs unavailable. Using ${input.resolvedOutputName}.`,
    };
  }

  return { message: null };
}
