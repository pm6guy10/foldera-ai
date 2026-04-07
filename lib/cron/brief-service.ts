/**
 * Brief lifecycle service — single authoritative entrypoint for
 * "run the brief lifecycle for a set of users."
 *
 * Both the manual route (/api/settings/run-brief) and the daily-brief cron
 * (/api/cron/daily-brief) call this function. No other file decides
 * when to generate, when to send, whether to retry send, or how to
 * normalize stage results.
 *
 * The send fallback (retry send when generate succeeded but send did not
 * confirm delivery) is opt-in via `ensureSend: true`.  Manual runs set
 * this flag; nightly cron does not need it.
 *
 * ## 20-hour full-cycle gate (inside runDailyGenerate, per user)
 *
 * After pending-queue short-circuits, each user may enter signal processing at most
 * once per 20 hours (`user_brief_cycle_gates.last_cycle_at`), for every caller
 * (cron, /api/settings/run-brief, /api/cron/trigger, /api/cron/daily-generate, dev).
 * `pipelineDryRun` and `TEST_USER_ID` do not advance or enforce the gate.
 *
 * `forceFreshRun` (`?force=true`, brain-receipt) does **not** clear valid
 * `pending_approval` within `STALE_PENDING_HOURS` — reconcile + guard reuse it until approve/skip.
 *
 * ## Two-gate enforcement (inside runDailyGenerate, per user)
 *
 * Pre-generation gate — evaluateReadiness():
 *   SEND              — fresh signal activity; proceed to generateDirective()
 *   NO_SEND           — cooldown active; return no_send_reused, no email, no UI card
 *   INSUFFICIENT_SIGNAL — stale backlog or no new signals; persist skipped evidence, stay silent
 *
 * Post-generation gate — isSendWorthy():
 *   worthy: true  — directive passes all quality checks; insert pending_approval
 *   worthy: false — output blocked (do_nothing / low confidence / no evidence / placeholder);
 *                   persist skipped evidence, stay silent
 *
 * Silence is literal: no-send paths use status='skipped' in tkg_actions so
 * runDailySend never finds them as email candidates.
 *
 * The approve field (null | true | false) on persisted directives is the
 * feedback signal for future quality improvement.
 */

import { runDailyBrief, runDailySend } from './daily-brief';
import { normalizeBriefResult } from './daily-brief-status';
import type { DailyBriefRunResult, DailyBriefSignalWindowOptions } from './daily-brief-types';

export interface BriefLifecycleOptions extends DailyBriefSignalWindowOptions {
  /**
   * When true, if generate produced a directive but send did not confirm
   * delivery, retry send once.  runDailySend is idempotent — it returns
   * email_already_sent if the email was delivered in the first pass.
   *
   * Set to true for manual/interactive runs.  Leave false (default) for
   * nightly batch runs.
   */
  ensureSend?: boolean;
}

export type NormalizedBriefResult = ReturnType<typeof normalizeBriefResult>;

function generatedDirectiveForUser(
  userId: string,
  results: Array<{ code: string; userId?: string }>,
): boolean {
  return results.some(
    (r) =>
      r.userId === userId &&
      (r.code === 'pending_approval_persisted' || r.code === 'pending_approval_reused'),
  );
}

function emailSentForUser(
  userId: string,
  results: Array<{ code: string; userId?: string }>,
): boolean {
  return results.some(
    (r) =>
      r.userId === userId &&
      (r.code === 'email_sent' || r.code === 'email_already_sent'),
  );
}

/**
 * Run the full brief lifecycle (generate → send) for the given users.
 *
 * Returns a normalized result shape ready to embed in a route response.
 * All orchestration decisions live here — routes call this and return JSON.
 */
export async function runBriefLifecycle(
  options: BriefLifecycleOptions = {},
): Promise<{ result: NormalizedBriefResult; sendFallbackAttempted: boolean }> {
  const brief = await runDailyBrief(options);
  let sendOverride: DailyBriefRunResult | undefined;
  let sendFallbackAttempted = false;

  if (options.ensureSend && options.userIds?.length) {
    for (const userId of options.userIds) {
      if (
        generatedDirectiveForUser(userId, brief.generate.results) &&
        !emailSentForUser(userId, brief.send.results)
      ) {
        sendOverride = await runDailySend({ userIds: options.userIds });
        sendFallbackAttempted = true;
        break;
      }
    }
  }

  return {
    result: normalizeBriefResult(brief, sendOverride),
    sendFallbackAttempted,
  };
}
