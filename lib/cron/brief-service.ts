/**
 * Brief lifecycle service — single authoritative entrypoint for
 * "run the brief lifecycle for a set of users."
 *
 * Manual route (/api/settings/run-brief) calls this to trigger generate-only
 * (no email — Slack Right Now card is the delivery surface). No other file
 * decides when to generate or how to normalize stage results.
 *
 * ## 20-hour full-cycle gate (inside runDailyGenerate, per user)
 *
 * After pending-queue short-circuits, each user may enter signal processing at most
 * once per 20 hours (`user_brief_cycle_gates.last_cycle_at`) for cron/trigger/daily-generate
 * and other callers that do not opt out. **Bypass:** `skipManualCallLimit: true` (e.g. dev
 * brain-receipt) or `briefInvocationSource === 'settings_run_brief'` (settings route — still
 * bypasses the 20h gate; daily spend / manual-call caps are enforced separately when not skipped).
 * `pipelineDryRun` and `TEST_USER_ID` do not advance or enforce the gate.
 *
 * `forceFreshRun` (`?force=true`, brain-receipt) does **not** clear valid
 * `pending_approval` within `STALE_PENDING_HOURS` — reconcile + guard reuse it until approve/skip.
 *
 * ## Two-gate enforcement (inside runDailyGenerate, per user)
 *
 * Pre-generation gate — evaluateReadiness():
 *   SEND              — fresh signal activity; proceed to generateDirective()
 *   NO_SEND           — cooldown active; return no_send_reused
 *   INSUFFICIENT_SIGNAL — stale backlog or no new signals; persist skipped no-send evidence
 *
 * Post-generation gate — isSendWorthy():
 *   worthy: true  — directive passes all quality checks; insert pending_approval
 *   worthy: false — output blocked (do_nothing / low confidence / no evidence / placeholder);
 *                   persist skipped no-send evidence
 *
 * The approve field (null | true | false) on persisted directives is the
 * feedback signal for future quality improvement.
 */

import { runDailyBrief } from './daily-brief';
import { normalizeBriefResult } from './daily-brief-status';
import type { DailyBriefSignalWindowOptions } from './daily-brief-types';

export interface BriefLifecycleOptions extends DailyBriefSignalWindowOptions {}

export type NormalizedBriefResult = ReturnType<typeof normalizeBriefResult>;

/**
 * Run the brief generate lifecycle for the given users.
 *
 * Returns a normalized result shape ready to embed in a route response.
 * Email send is removed — Slack Right Now card is the delivery surface.
 */
export async function runBriefLifecycle(
  options: BriefLifecycleOptions = {},
): Promise<{ result: NormalizedBriefResult; sendFallbackAttempted: boolean }> {
  const brief = await runDailyBrief(options);

  return {
    result: normalizeBriefResult(brief),
    sendFallbackAttempted: false,
  };
}
