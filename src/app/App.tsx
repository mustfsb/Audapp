import { startTransition, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import {
  mockChannels,
  mockDevices,
  mockEngineStatus,
  mockNoiseSuppression,
  mockProfiles,
  mockSettings,
} from "@/data/mock-audio";
import { AudioDspProvider } from "@/lib/use-audio-dsp";
import { useAudioDiscovery } from "@/lib/use-audio-discovery";
import { useAudioSessionControl } from "@/lib/use-audio-session-control";
import { useChannelAssignments } from "@/lib/use-channel-assignments";
import { useMixerChannelSettings } from "@/lib/use-mixer-channel-settings";
import { invokeOrFallback } from "@/lib/tauri";
import { applyTheme, getInitialTheme, type Theme } from "@/lib/theme";
import type {
  AppSettings,
  AudioChannel,
  AudioProfile,
  EngineStatus,
  NoiseSuppressionState,
  SectionId,
} from "@/types/audio";

import { AppsView } from "@/components/apps/apps-view";
import { EngineLabView } from "@/components/engine/engine-lab-view";
import { RoutingLabView } from "@/components/routing/routing-lab-view";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { DevicesView } from "@/components/devices/devices-view";
import { EqualizerView } from "@/components/eq/equalizer-view";
import { AppShell } from "@/components/layout/app-shell";
import { MixerView } from "@/components/mixer/mixer-view";
import { NoiseView } from "@/components/noise/noise-view";
import { ProfilesView } from "@/components/profiles/profiles-view";
import { SettingsView } from "@/components/settings/settings-view";

const navigation = [
  { id: "dashboard", label: "Dashboard", description: "" },
  { id: "mixer", label: "Mixer", description: "" },
  { id: "apps", label: "Apps", description: "" },
  { id: "devices", label: "Devices", description: "" },
  { id: "equalizer", label: "Equalizer", description: "" },
  { id: "noise", label: "Noise", description: "" },
  { id: "profiles", label: "Profiles", description: "" },
  { id: "settings", label: "Settings", description: "" },
  { id: "engine", label: "Engine Lab", description: "" },
  { id: "routing", label: "Routing Lab", description: "" },
] as const satisfies ReadonlyArray<{
  id: SectionId;
  label: string;
  description: string;
}>;

export default function App() {
  const [activeSection, setActiveSection] = useState<SectionId>("dashboard");
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());
  const [appVersion, setAppVersion] = useState("0.1.0");
  const [channelErrors, setChannelErrors] = useState<Record<string, string>>({});
  const channelPendingRef = useRef<Set<string>>(new Set());
  const [channelPendingVersion, setChannelPendingVersion] = useState(0);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>(mockEngineStatus);
  const [channels, setChannels] = useState<AudioChannel[]>(mockChannels);
  const [profiles, setProfiles] = useState<AudioProfile[]>(mockProfiles);
  const [noiseSuppression, setNoiseSuppression] =
    useState<NoiseSuppressionState>(mockNoiseSuppression);
  const [settings, setSettings] = useState<AppSettings>(mockSettings);
  const [selectedOutputId, setSelectedOutputId] = useState("out-1");
  const [selectedInputId, setSelectedInputId] = useState("in-1");

  const {
    snapshot,
    isLoading: isDiscoveryLoading,
    refresh: refreshDiscovery,
    applySnapshot,
  } = useAudioDiscovery();
  const sessionControl = useAudioSessionControl(applySnapshot);
  const channelAssignments = useChannelAssignments();
  const mixerChannelSettings = useMixerChannelSettings();
  const mixerSettingsAppliedRef = useRef(false);

  useEffect(() => {
    void invokeOrFallback("get_app_version", "0.1.0").then(setAppVersion);
    void invokeOrFallback("get_audio_engine_status", mockEngineStatus).then(setEngineStatus);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (mixerChannelSettings.isLoading || mixerSettingsAppliedRef.current) {
      return;
    }

    if (mixerChannelSettings.settings.length === 0) {
      mixerSettingsAppliedRef.current = true;
      return;
    }

    setChannels((current) => mixerChannelSettings.applyToChannels(current));
    mixerSettingsAppliedRef.current = true;
  }, [
    mixerChannelSettings.isLoading,
    mixerChannelSettings.settings,
    mixerChannelSettings.applyToChannels,
  ]);

  const discoveryDevices = snapshot.devices;
  const discoverySessions = snapshot.sessions;
  const discoveryStatus = snapshot.status;

  const outputDevices = useMemo(
    () => discoveryDevices.filter((device) => device.kind === "output"),
    [discoveryDevices],
  );

  const mixerOutputDevices = useMemo(
    () =>
      outputDevices.map((device) => ({
        id: device.id,
        name: device.name,
        kind: device.kind,
        connection: "Windows endpoint",
        isDefault: device.isDefault,
        sampleRate: 0,
        bitDepth: 0,
        health: device.state === "active" ? ("Healthy" as const) : ("Attention" as const),
        channels: "Unknown",
        latencyMs: 0,
      })),
    [outputDevices],
  );

  function updateChannel(id: string, updater: (channel: AudioChannel) => AudioChannel) {
    setChannels((current) => current.map((channel) => (channel.id === id ? updater(channel) : channel)));
  }

  function setChannelPending(channelId: string, pending: boolean) {
    if (pending) {
      channelPendingRef.current.add(channelId);
    } else {
      channelPendingRef.current.delete(channelId);
    }
    setChannelPendingVersion((v) => v + 1);
  }

  const channelIsPending = useCallback(
    (channelId: string) => channelPendingRef.current.has(channelId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channelPendingVersion],
  );

  const handleMixerMuteToggle = useCallback(
    async (channelId: string, newMuted: boolean) => {
      const currentChannel = channels.find((item) => item.id === channelId);
      updateChannel(channelId, (ch) => ({
        ...ch,
        muted: newMuted,
        peak: newMuted ? 0 : ch.volume,
      }));
      void mixerChannelSettings.persistChannelSetting(
        channelId,
        currentChannel?.volume ?? 0,
        newMuted,
      );

      const sessions = discoverySessions.filter(
        (s) => channelAssignments.assignmentBySession(s)?.channelId === channelId,
      );
      if (sessions.length === 0) return;

      setChannelPending(channelId, true);
      const results = await Promise.allSettled(
        sessions.map((s) => sessionControl.setMuted(s, newMuted)),
      );
      setChannelPending(channelId, false);

      const errorMsgs: string[] = [];
      for (const result of results) {
        if (result.status === "rejected") {
          errorMsgs.push("Command failed");
        } else if (result.value && !result.value.ok) {
          errorMsgs.push(result.value.message ?? "Session control failed");
        }
      }

      if (errorMsgs.length > 0) {
        setChannelErrors((prev) => ({ ...prev, [channelId]: errorMsgs.join("; ") }));
      } else {
        setChannelErrors((prev) => {
          if (!(channelId in prev)) return prev;
          const next = { ...prev };
          delete next[channelId];
          return next;
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channels, discoverySessions, channelAssignments, sessionControl, mixerChannelSettings],
  );

  const handleMixerVolumeCommit = useCallback(
    async (channelId: string, volumePercent: number) => {
      const sessions = discoverySessions.filter(
        (s) => channelAssignments.assignmentBySession(s)?.channelId === channelId,
      );
      const channel = channels.find((item) => item.id === channelId);
      void mixerChannelSettings.persistChannelSetting(
        channelId,
        volumePercent,
        channel?.muted ?? false,
      );

      if (sessions.length === 0) return;

      setChannelPending(channelId, true);
      const results = await Promise.allSettled(
        sessions.map((s) => sessionControl.setVolume(s, volumePercent)),
      );
      setChannelPending(channelId, false);

      const errorMsgs: string[] = [];
      for (const result of results) {
        if (result.status === "rejected") {
          errorMsgs.push("Command failed");
        } else if (result.value && !result.value.ok) {
          errorMsgs.push(result.value.message ?? "Session control failed");
        }
      }

      if (errorMsgs.length > 0) {
        setChannelErrors((prev) => ({ ...prev, [channelId]: errorMsgs.join("; ") }));
      } else {
        setChannelErrors((prev) => {
          if (!(channelId in prev)) return prev;
          const next = { ...prev };
          delete next[channelId];
          return next;
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [discoverySessions, channelAssignments, sessionControl, channels, mixerChannelSettings],
  );

  const assignmentCountsByChannel = useMemo(() => {
    const counts = Object.fromEntries(channels.map((channel) => [channel.id, 0])) as Record<
      string,
      number
    >;

    for (const session of discoverySessions) {
      const assignment = channelAssignments.assignmentBySession(session);
      if (assignment && assignment.channelId in counts) {
        counts[assignment.channelId] = (counts[assignment.channelId] ?? 0) + 1;
      }
    }

    return counts;
  }, [channels, discoverySessions, channelAssignments]);

  function activateProfile(id: string) {
    setProfiles((current) =>
      current.map((profile) => ({ ...profile, active: profile.id === id })),
    );

    const profile = profiles.find((item) => item.id === id);
    if (profile) {
      setSettings((current) => ({ ...current, latencyMode: profile.latencyMode }));
      setEngineStatus((current) => ({ ...current, latencyMode: profile.latencyMode }));
    }
  }

  const content = {
    dashboard: (
      <DashboardView
        devices={mockDevices}
        selectedOutputId={selectedOutputId}
        selectedInputId={selectedInputId}
        onSelectOutput={setSelectedOutputId}
        onSelectInput={setSelectedInputId}
        channels={channels}
        onVolumeChange={(id, value) =>
          updateChannel(id, (ch) => ({
            ...ch,
            volume: value,
            peak: Math.min(100, value + 6),
            meterHold: Math.min(100, value + 12),
          }))
        }
        onVolumeCommit={(id, value) => {
          updateChannel(id, (ch) => ({ ...ch, volume: value }));
          void handleMixerVolumeCommit(id, value);
        }}
        onMuteToggle={(id, muted) => void handleMixerMuteToggle(id, muted)}
        isDiscoveryLoading={isDiscoveryLoading}
        onRefreshDiscovery={() => void refreshDiscovery()}
      />
    ),
    mixer: (
      <MixerView
        channels={channels}
        assignmentCountsByChannel={assignmentCountsByChannel}
        outputDevices={mixerOutputDevices.length > 0 ? mixerOutputDevices : []}
        onVolumeChange={(id, value) =>
          updateChannel(id, (channel) => ({
            ...channel,
            volume: value,
            peak: Math.min(100, value + 6),
            meterHold: Math.min(100, value + 12),
          }))
        }
        onVolumeCommit={(id, value) => {
          updateChannel(id, (channel) => ({ ...channel, volume: value }));
          void handleMixerVolumeCommit(id, value);
        }}
        onMuteToggle={(id, newMuted) => {
          void handleMixerMuteToggle(id, newMuted);
        }}
        onSoloToggle={(id) =>
          updateChannel(id, (channel) => ({ ...channel, solo: !channel.solo }))
        }
        onOutputChange={(id, outputDeviceId) =>
          updateChannel(id, (channel) => ({ ...channel, outputDeviceId }))
        }
        channelErrors={channelErrors}
        channelIsPending={channelIsPending}
        settingsError={mixerChannelSettings.error}
        settingsWarning={mixerChannelSettings.loadWarning}
      />
    ),
    apps: (
      <AppsView
        sessions={discoverySessions}
        channels={channels}
        outputDevices={outputDevices}
        channelIdForSession={channelAssignments.channelIdForSession}
        isLoading={isDiscoveryLoading}
        isAssignmentsLoading={channelAssignments.isLoading}
        assignmentsError={channelAssignments.error}
        isSessionPending={sessionControl.isPending}
        sessionError={sessionControl.sessionError}
        onChannelChange={(session, channelId) => {
          const channel = channels.find((item) => item.id === channelId);
          void channelAssignments.setAssignmentForSession(
            session,
            channelId,
            channel?.name ?? session.displayName,
          );
        }}
        onVolumeCommit={(session, volumePercent) => {
          void sessionControl.setVolume(session, volumePercent);
        }}
        onMuteToggle={(session, muted) => {
          void sessionControl.setMuted(session, muted);
        }}
        onRefresh={() => void refreshDiscovery()}
      />
    ),
    devices: (
      <DevicesView
        devices={discoveryDevices}
        isLoading={isDiscoveryLoading}
        onRefresh={() => void refreshDiscovery()}
      />
    ),
    equalizer: <EqualizerView />,
    noise: (
      <NoiseView
        enabled={noiseSuppression.enabled}
        strength={noiseSuppression.strength}
        inputGain={noiseSuppression.inputGain}
        gateThreshold={noiseSuppression.gateThreshold}
        previewLevel={noiseSuppression.previewLevel}
        onEnabledChange={(value) =>
          setNoiseSuppression((current) => ({ ...current, enabled: value }))
        }
        onStrengthChange={(value) =>
          setNoiseSuppression((current) => ({ ...current, strength: value }))
        }
        onInputGainChange={(value) =>
          setNoiseSuppression((current) => ({ ...current, inputGain: value }))
        }
        onGateThresholdChange={(value) =>
          setNoiseSuppression((current) => ({ ...current, gateThreshold: value }))
        }
      />
    ),
    profiles: <ProfilesView profiles={profiles} onActivate={activateProfile} />,
    settings: (
      <SettingsView
        settings={settings}
        engineStatus={engineStatus}
        appVersion={appVersion}
        onToggle={(key, value) => setSettings((current) => ({ ...current, [key]: value }))}
        onLatencyModeChange={(value) => {
          setSettings((current) => ({ ...current, latencyMode: value }));
          setEngineStatus((current) => ({ ...current, latencyMode: value }));
        }}
      />
    ),
    engine: (
      <EngineLabView
        outputDevices={outputDevices}
        inputDevices={discoveryDevices.filter((d) => d.kind === "input")}
      />
    ),
    routing: (
      <RoutingLabView
        outputDevices={outputDevices}
        inputDevices={discoveryDevices.filter((d) => d.kind === "input")}
      />
    ),
  } satisfies Record<SectionId, ReactElement>;

  return (
    <AudioDspProvider>
    <AppShell
      items={[...navigation]}
      activeSection={activeSection}
      onSelectSection={(section) => {
        startTransition(() => setActiveSection(section));
      }}
      profiles={profiles}
      deviceCount={discoveryStatus.deviceCount}
      version={appVersion}
      status={engineStatus}
      discoveryStatus={discoveryStatus}
      theme={theme}
      onToggleTheme={() =>
        setTheme((current) => (current === "dark" ? "light" : "dark"))
      }
      onRefreshDiscovery={() => void refreshDiscovery()}
      isDiscoveryLoading={isDiscoveryLoading}
    >
      {content[activeSection]}
    </AppShell>
    </AudioDspProvider>
  );
}
