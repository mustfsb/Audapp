/**
 * Maps a semantic status to a *filled* badge variant. Primary product status
 * should never be a transparent outline-only badge — each state gets a solid
 * background with readable text (see `components/ui/badge.tsx`).
 */
export type StatusKind = "ok" | "warning" | "error" | "legacy" | "info" | "neutral";

export type FilledBadgeVariant =
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "secondary";

const STATUS_VARIANTS: Record<StatusKind, FilledBadgeVariant> = {
  ok: "success",
  warning: "warning",
  error: "destructive",
  legacy: "secondary",
  neutral: "secondary",
  info: "info",
};

/** Filled badge variants only — used to assert no status maps to "outline". */
export const FILLED_BADGE_VARIANTS: readonly FilledBadgeVariant[] = [
  "success",
  "warning",
  "destructive",
  "info",
  "secondary",
] as const;

export function statusBadgeVariant(kind: StatusKind): FilledBadgeVariant {
  return STATUS_VARIANTS[kind];
}

/** Short, user-facing label for a boolean availability state. */
export function availabilityStatus(available: boolean): StatusKind {
  return available ? "ok" : "error";
}
