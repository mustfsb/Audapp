export type MixerChannelSetting = {
  channelId: string;
  volumePercent: number;
  muted: boolean;
  updatedAt: string;
};

export type SetMixerChannelSettingInput = {
  channelId: string;
  volumePercent: number;
  muted: boolean;
};
