import type { AudioDiscoverySession } from "@/types/discovery";
import type { SessionRouteIntent, SessionRouteStatus } from "@/types/session-control";

export type AudioSessionView = AudioDiscoverySession & {
  routeIntent: SessionRouteIntent;
  routeIntentKey: string | null;
  routeStatus: SessionRouteStatus | null;
};
