/**
 * GET /api/conviction/latest
 *
 * Returns the highest-confidence pending action summary for the authenticated
 * user. Heavy artifact payloads stay behind the per-action detail route.
 */

import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { apiErrorForRoute } from '@/lib/utils/api-error';
import { buildContextGreeting } from '@/lib/briefing/context-builder';
import { CONFIDENCE_SEND_THRESHOLD } from '@/lib/config/constants';
import { getSubscriptionStatus } from '@/lib/auth/subscription';
import { evaluateDiscrepancyCardFrame } from '@/lib/briefing/discrepancy-card-frame';
import { buildDailyUtilitySlateFromReceipts } from '@/lib/briefing/daily-utility-slate';
import { jsonWithReadOnlyUserCache } from '@/lib/utils/read-only-user-cache';
import {
  ACTION_RANKING_SELECT,
  ACTION_SLATE_SELECT,
  ACTION_SUMMARY_SELECT,
  buildDiscrepancyCardFromSummary,
  type ActionSummaryRow,
} from '@/lib/conviction/action-read-shapes';

export const dynamic = 'force-dynamic';
const MIN_PENDING_CONFIDENCE = CONFIDENCE_SEND_THRESHOLD;
const PENDING_RANKING_LIMIT = 5;
const FREE_ARTIFACT_ALLOWANCE = 3;
const PENDING_RANKING_SELECT = ACTION_RANKING_SELECT;
const PENDING_SUMMARY_SELECT = ACTION_SUMMARY_SELECT;
const SLATE_RECEIPT_SELECT = ACTION_SLATE_SELECT;
const CONSUMED_FREE_ARTIFACT_STATUSES = ['approved', 'executed', 'skipped'] as const;
const SLATE_RECEIPT_STATUSES = ['skipped', 'executed', 'approved'] as const;

type PendingRankingRow = {
  id?: unknown;
  confidence?: unknown;
  generated_at?: unknown;
  brief_origin?: unknown;
};

function jsonReadCache(payload: unknown): NextResponse {
  return jsonWithReadOnlyUserCache(payload);
}

function startOfTodayIso(): string {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

function isProUnlocked(status: string | null | undefined): boolean {
  return status === 'active' || status === 'active_trial' || status === 'past_due';
}

function isPendingRankingRow(value: unknown): value is PendingRankingRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as PendingRankingRow;
  return typeof row.id === 'string' && typeof row.confidence === 'number';
}

function canEnterPendingRanking(row: PendingRankingRow): boolean {
  return (
    (typeof row.confidence === 'number' && row.confidence >= MIN_PENDING_CONFIDENCE) ||
    row.brief_origin === 'selected_move_generate'
  );
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function hasSummaryArtifact(action: ActionSummaryRow | null | undefined): boolean {
  return Boolean(
    asString(action?.artifact_type) ||
      asString(action?.artifact_title) ||
      asString(action?.artifact_preview),
  );
}

async function getConsumedFreeArtifactCount(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<number> {
  try {
    const { count } = await supabase
      .from('tkg_actions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', [...CONSUMED_FREE_ARTIFACT_STATUSES]);
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function buildDailyUtilitySlatePayload(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
) {
  try {
    const { data, error } = await supabase
      .from('tkg_action_summaries')
      .select(SLATE_RECEIPT_SELECT)
      .eq('user_id', userId)
      .in('status', [...SLATE_RECEIPT_STATUSES])
      .order('generated_at', { ascending: false })
      .limit(5);

    if (error) {
      throw new Error(error.message ?? JSON.stringify(error));
    }

    return buildDailyUtilitySlateFromReceipts(Array.isArray(data) ? data : []);
  } catch (error) {
    console.warn(
      '[conviction/latest] daily utility slate unavailable:',
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

export async function GET(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const supabase = createServerClient();

    void (async () => {
      try {
        const { error: visitErr } = await supabase
          .from('user_subscriptions')
          .update({ last_dashboard_visit_at: new Date().toISOString() })
          .eq('user_id', userId);
        if (visitErr) {
          console.warn('[conviction/latest] last_dashboard_visit_at update failed:', visitErr.message);
        }
      } catch {
        /* non-blocking */
      }
    })();

    const { data: candidates, error } = await supabase
      .from('tkg_action_summaries')
      .select(PENDING_RANKING_SELECT)
      .eq('user_id', userId)
      .eq('status', 'pending_approval')
      .order('confidence', { ascending: false })
      .order('generated_at', { ascending: false })
      .limit(PENDING_RANKING_LIMIT);

    if (error) {
      throw new Error(error.message ?? JSON.stringify(error));
    }

    const consumedFreeArtifactCount = await getConsumedFreeArtifactCount(supabase, userId);
    const freeArtifactRemaining = consumedFreeArtifactCount < FREE_ARTIFACT_ALLOWANCE;

    let subscriptionStatus: string | null = null;
    try {
      const sub = await getSubscriptionStatus(userId);
      subscriptionStatus = sub.status;
    } catch {
      subscriptionStatus = null;
    }
    const proUnlocked = isProUnlocked(subscriptionStatus);

    const rankingRows = (candidates ?? []).filter(isPendingRankingRow);
    const todaysCandidates = rankingRows.filter((candidate) => {
      const generatedAt = typeof candidate.generated_at === 'string' ? candidate.generated_at : '';
      return generatedAt >= startOfTodayIso();
    });
    const rankedCandidates = (todaysCandidates.length > 0 ? todaysCandidates : rankingRows).filter(
      canEnterPendingRanking,
    );
    const selectedCandidate = rankedCandidates[0];

    let selectedAction: ActionSummaryRow | null = null;
    if (selectedCandidate?.id) {
      const { data: selectedSummary, error: selectedSummaryError } = await supabase
        .from('tkg_action_summaries')
        .select(PENDING_SUMMARY_SELECT)
        .eq('user_id', userId)
        .eq('status', 'pending_approval')
        .eq('id', selectedCandidate.id)
        .maybeSingle();

      if (selectedSummaryError) {
        throw new Error(selectedSummaryError.message ?? JSON.stringify(selectedSummaryError));
      }

      if (selectedSummary) {
        selectedAction = selectedSummary as ActionSummaryRow;
      }
    }

    let contextGreeting: string | null = null;
    let accountCreatedAt: string | null = null;

    if (!selectedAction) {
      try {
        contextGreeting = await buildContextGreeting(userId);
      } catch {
        contextGreeting = 'Today. 0 active commitments. Top priority: None set.';
      }

      try {
        const { data: userData, error: authUserError } = await supabase.auth.admin.getUserById(userId);
        if (!authUserError) {
          accountCreatedAt = userData.user?.created_at ?? null;
        }
      } catch {
        accountCreatedAt = null;
      }

      const dailyUtilitySlate = await buildDailyUtilitySlatePayload(supabase, userId);

      return jsonReadCache({
        context_greeting: contextGreeting,
        account_created_at: accountCreatedAt,
        approved_count: consumedFreeArtifactCount,
        is_subscribed: proUnlocked,
        free_artifact_remaining: freeArtifactRemaining,
        artifact_paywall_locked: false,
        finished_artifact_verdict: 'no_finished_artifact',
        daily_utility_slate: dailyUtilitySlate,
      });
    }

    const discrepancyCard = buildDiscrepancyCardFromSummary(selectedAction);
    const discrepancyQuality = evaluateDiscrepancyCardFrame(discrepancyCard);
    if (!hasSummaryArtifact(selectedAction) || !discrepancyCard || !discrepancyQuality.passes) {
      try {
        contextGreeting = await buildContextGreeting(userId);
      } catch {
        contextGreeting = 'Today. 0 active commitments. Top priority: None set.';
      }

      const dailyUtilitySlate = await buildDailyUtilitySlatePayload(supabase, userId);

      return jsonReadCache({
        context_greeting: contextGreeting,
        account_created_at: accountCreatedAt,
        approved_count: consumedFreeArtifactCount,
        is_subscribed: proUnlocked,
        free_artifact_remaining: freeArtifactRemaining,
        artifact_paywall_locked: false,
        finished_artifact_verdict: 'no_finished_artifact',
        daily_utility_slate: dailyUtilitySlate,
        no_safe_artifact_reason: discrepancyQuality.rejection_reason ?? 'missing_discrepancy_card',
        blocked_latest_action: {
          id: selectedAction.id,
          title: selectedAction.directive_text,
          blocked_by: discrepancyQuality.blocked_by,
          rejection_reason: discrepancyQuality.rejection_reason ?? 'missing_discrepancy_card',
        },
      });
    }

    const artifactPaywallLocked = hasSummaryArtifact(selectedAction) && !proUnlocked && !freeArtifactRemaining;
    return jsonReadCache({
      id: selectedAction.id,
      userId,
      directive: selectedAction.directive_text,
      action_type: selectedAction.action_type,
      confidence: selectedAction.confidence,
      reason: selectedAction.reason,
      status: selectedAction.status,
      generatedAt: selectedAction.generated_at,
      approvedAt: selectedAction.approved_at ?? undefined,
      executedAt: selectedAction.executed_at ?? undefined,
      discrepancy_card: discrepancyCard,
      discrepancy_quality: discrepancyQuality,
      artifact_type: selectedAction.artifact_type ?? undefined,
      artifact_title: selectedAction.artifact_title ?? undefined,
      brief_origin: selectedAction.brief_origin ?? undefined,
      detail_required: true,
      detail_url: `/api/conviction/actions/${selectedAction.id}`,
      finished_artifact_verdict: 'strict_artifact_selected',
      daily_utility_slate: null,
      context_greeting: null,
      account_created_at: null,
      approved_count: consumedFreeArtifactCount,
      is_subscribed: proUnlocked,
      free_artifact_remaining: freeArtifactRemaining,
      artifact_paywall_locked: artifactPaywallLocked,
    });
  } catch (err: unknown) {
    return apiErrorForRoute(err, 'conviction/latest');
  }
}
