// The dismiss half of the judgment ratchet.
//
// The approve half already teaches the scorer: the winner's backing tkg_actions row
// (real action_type, status pending_approval — seed-from-scorer-core) flips to
// approved/executed through executeAction, which getApprovalHistory reads back into
// computeCandidateScore's behavioral rate. Dismiss never closed that loop: the card's
// presence_action receipt rows carry an action_type no candidate can ever match, so
// every dismissal was inert for ranking (issue #592 — "ratchet the JUDGMENT, not the
// row"). This routes a Dismiss tap through the SAME executeAction skip path the
// dashboard conviction surface uses (status 'skipped', feedback_weight -0.5,
// skip_reason), against the winner's real backing row.
import { executeAction } from '@/lib/conviction/execute-action';
import type { WorkdayPresenceState } from '@/lib/workday-presence/model';

export type DismissJudgmentSource = 'slack_dismiss' | 'dashboard_dismiss';

export type DismissJudgmentResult = {
  recorded: boolean;
  reason: string;
};

/**
 * Best-effort by design: the card interaction (snooze + receipt) must succeed even
 * when the learning write cannot — never throws.
 *
 * - No backing action row (manual anchors, legacy cards, artifact-persist failures)
 *   → nothing to teach; recorded: false.
 * - Row already claimed (e.g. dismissed after an approved send) → executeAction's
 *   atomic claim refuses and this is a no-op; the earlier decision stands.
 */
export async function recordDismissJudgment(
  userId: string,
  state: WorkdayPresenceState | null,
  source: DismissJudgmentSource,
): Promise<DismissJudgmentResult> {
  const actionId = state?.draft?.action_id?.trim();
  if (!actionId) {
    return { recorded: false, reason: 'no_backing_action' };
  }

  try {
    const result = await executeAction({
      userId,
      actionId,
      decision: 'skip',
      skipReason: source,
    });
    if (result.error) {
      return { recorded: false, reason: result.error };
    }
    return { recorded: true, reason: result.status };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[judgment-feedback] dismiss feedback failed:', message);
    return { recorded: false, reason: message };
  }
}
