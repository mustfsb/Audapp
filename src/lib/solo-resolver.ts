export type SoloState = {
  soloActive: boolean;
  soloedIds: ReadonlySet<string>;
  mutedBySoloIds: ReadonlySet<string>;
};

/**
 * Computes the effective solo state given the full channel list and the set of
 * channels the user has explicitly soloed.
 *
 * soloedIds      — channels that stay audible
 * mutedBySoloIds — every other channel, forced-muted while solo is active
 */
export function computeSoloState(
  allChannelIds: string[],
  soloedIds: Set<string>,
): SoloState {
  const soloActive = soloedIds.size > 0;
  const mutedBySoloIds: Set<string> = soloActive
    ? new Set(allChannelIds.filter((id) => !soloedIds.has(id)))
    : new Set();
  return { soloActive, soloedIds, mutedBySoloIds };
}

/** Returns a new Set with channelId added (if absent) or removed (if present). */
export function toggleSoloInSet(current: ReadonlySet<string>, channelId: string): Set<string> {
  const next = new Set(current);
  if (next.has(channelId)) {
    next.delete(channelId);
  } else {
    next.add(channelId);
  }
  return next;
}
