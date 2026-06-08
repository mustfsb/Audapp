import { channelLabel, DEFAULT_EQ_CHANNEL, type EqChannelId } from "./channel-eq.ts";

export const EQ_PRESET_TRIGGER_CLASSNAME =
  "h-9 flex-1 rounded-xl border-border/60 bg-card/80 shadow-none hover:bg-card focus-visible:ring-ring/20";

export const EQ_PRESET_CONTENT_CLASSNAME =
  "rounded-xl border-border/60 bg-popover/95 p-1 shadow-xl ring-1 ring-black/5 dark:ring-white/10";

export function buildEqualizerViewModel(selectedChannelId: EqChannelId = DEFAULT_EQ_CHANNEL) {
  return {
    selectedChannel: {
      id: selectedChannelId,
      label: channelLabel(selectedChannelId),
    },
    editorTargetChannelId: selectedChannelId,
    visibleEditorCount: 1,
    visibleEditors: ["channel"],
    masterPanelVisible: false,
    advancedSectionId: "master-output-protection",
  } as const;
}
