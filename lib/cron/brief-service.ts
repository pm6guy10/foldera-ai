/**
 * Brief lifecycle service — single authoritative entrypoint for
 * "run the brief lifecycle for a set of users."
 *
 * Both the manual route (/api/settings/run-brief) and the nightly cron
 * (/api/cron/nightly-ops) call this function. No other file decides
 * when to generate, when to send, whether to retry send, or how to
 * normalize stage results.
 *
 * The send fallback (retry send when generate succeeded but send did not
 * confirm delivery) is opt-in via `ensureSend: true`.  Manual runs set
 * this flag; nightly cron does not need it.
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
