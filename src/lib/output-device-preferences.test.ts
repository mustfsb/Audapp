import test from "node:test";
import assert from "node:assert/strict";

import type { AudioDiscoveryDevice } from "../types/discovery.ts";

import {
  buildOutputPreferenceViewModel,
  deriveOutputPreferenceStatus,
  isEligiblePreferredOutput,
} from "./output-device-preferences.ts";

function device(
  overrides: Partial<AudioDiscoveryDevice> & Pick<AudioDiscoveryDevice, "id" | "name">,
): AudioDiscoveryDevice {
  return {
    kind: "output",
    state: "active",
    isDefault: false,
    isAudappEndpoint: false,
    audappEndpointKind: null,
    audappChannelId: null,
    ...overrides,
  };
}

test("only active non-Audapp output devices are eligible for primary or fallback selection", () => {
  const speaker = device({ id: "speaker", name: "Speakers (USB Audio Device)" });
  const audapp = device({
    id: "audapp-general",
    name: "Audapp General",
    isAudappEndpoint: true,
    audappEndpointKind: "channel_output",
    audappChannelId: "general",
  });
  const microphone = {
    ...device({ id: "mic", name: "Microphone (USB Audio Device)" }),
    kind: "input" as const,
  };
  const unplugged = device({
    id: "headphones",
    name: "Headphones (Realtek)",
    state: "unplugged",
  });

  assert.equal(isEligiblePreferredOutput(speaker), true);
  assert.equal(isEligiblePreferredOutput(audapp), false);
  assert.equal(isEligiblePreferredOutput(microphone), false);
  assert.equal(isEligiblePreferredOutput(unplugged), false);
});

test("view model marks primary and fallback devices with stable badges", () => {
  const devices = [
    device({ id: "speaker", name: "Speakers (USB Audio Device)" }),
    device({ id: "hdmi", name: "Monitor (HDMI Audio)" }),
  ];

  const view = buildOutputPreferenceViewModel(devices, {
    primary: { endpointId: "speaker", name: "Speakers (USB Audio Device)" },
    fallback: { endpointId: "hdmi", name: "Monitor (HDMI Audio)" },
  });

  assert.equal(view.summary.primaryLabel, "Speakers (USB Audio Device)");
  assert.equal(view.summary.fallbackLabel, "Monitor (HDMI Audio)");
  assert.deepEqual(view.devices.map((item) => item.badge), ["Primary", "Fallback"]);
});

test("unavailable primary reports that fallback is being used", () => {
  const status = deriveOutputPreferenceStatus({
    primary: { endpointId: "speaker", name: "Speakers (USB Audio Device)" },
    fallback: { endpointId: "hdmi", name: "Monitor (HDMI Audio)" },
    resolvedOutputName: "Monitor (HDMI Audio)",
    resolutionReason: "fallback",
  });

  assert.equal(
    status.message,
    "Primary output not found. Using fallback: Monitor (HDMI Audio).",
  );
});

test("missing preferred outputs report the auto-selected device", () => {
  const status = deriveOutputPreferenceStatus({
    primary: { endpointId: "speaker", name: "Speakers (USB Audio Device)" },
    fallback: { endpointId: "hdmi", name: "Monitor (HDMI Audio)" },
    resolvedOutputName: "Headphones (Realtek)",
    resolutionReason: "auto",
  });

  assert.equal(
    status.message,
    "Preferred outputs unavailable. Using Headphones (Realtek).",
  );
});
