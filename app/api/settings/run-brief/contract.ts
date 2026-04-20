export const RUN_BRIEF_CHEAP_DRY_RUN_STAGE_KEYS = ['daily_brief'] as const;

export const RUN_BRIEF_CHEAP_DRY_RUN_STAGE = {
  ok: true,
  status: 'short_circuited',
  reason: 'cheap_dry_run',
  manual_send_fallback_attempted: false,
} as const;

export function getRunBriefRouteStatus(ok: boolean): 200 | 207 {
  return ok ? 200 : 207;
}
