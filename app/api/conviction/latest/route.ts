/**
 * GET /api/conviction/latest
 *
 * Returns the most recent tkg_actions row with status=pending_approval
 * for the authenticated user. If nothing is pending, returns 200 with
 * a context greeting only so the dashboard can render its empty state.
 */

import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { apiErrorForRoute } from '@/lib/utils/api-error';
import { buildContextGreeting } from '@/lib/briefing/context-builder';
import { CONFIDENCE_SEND_THRESHOLD } from '@/lib/config/constants';
import { getSubscriptionStatus } from '@/lib/auth/subscription';

export const dynamic = 'force-dynamic';
const MIN_PENDING_CONFIDENCE = CONFIDENCE_SEND_THRESHOLD;
const PENDING_RANKING_LIMIT = 5;
const FREE_ARTIFACT_ALLOWANCE = 3;
const PENDING_RANKING_SELECT = 'id, confidence, generated_at, status';
const PENDING_PAYLOAD_SELECT =
  'id, action_type, directive_text, reason, confidence, evidence, status, generated_at, approved_at, executed_at, execution_result, artifact';
const CONSUMED_FREE_ARTIFACT_STATUSES = ['approved', 'executed', 'skipped'] as const;
const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  Pragma: 'no-cache',
} as const;

type PendingRankingRow = {
  id?: unknown;
  confidence?: unknown;
  generated_at?: unknown;
};

function jsonNoStore(payload: unknown): NextResponse {
  return NextResponse.json(payload, { status: 200, headers: NO_STORE_HEADERS });
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

/**
 * Merge execution_result.artifact with the persisted `artifact` column (column wins),
 * matching the brain-receipt / persistence path so ranking and the dashboard see the same payload.
 */
function extractArtifact(action: Record<string, unknown>): Record<string, unknown> | undefined {
  const executionResult =
    action.execution_result && typeof action.execution_result === 'object'
      ? (action.execution_result as Record<string, unknown>)
      : null;

  const erArtifact =
    executionResult?.artifact && typeof executionResult.artifact === 'object'
      ? (executionResult.artifact as Record<string, unknown>)
      : {};

  const colArtifact =
    action.artifact && typeof action.artifact === 'object'
      ? (action.artifact as Record<string, unknown>)
      : {};

  const merged = { ...erArtifact, ...colArtifact };
  if (Object.keys(merged).length === 0) {
    return undefined;
  }
  return merged;
}

export async function GET(request: Request) {
  // Auth
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
      .from('tkg_actions')
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
      (candidate) => candidate.confidence >= MIN_PENDING_CONFIDENCE,
    );
    const selectedCandidate = rankedCandidates[0];

    let action: Record<string, unknown> | null = null;
    if (selectedCandidate?.id) {
      const { data: selectedAction, error: selectedActionError } = await supabase
        .from('tkg_actions')
        .select(PENDING_PAYLOAD_SELECT)
        .eq('user_id', userId)
        .eq('status', 'pending_approval')
        .eq('id', selectedCandidate.id)
        .maybeSingle();

      if (selectedActionError) {
        throw new Error(selectedActionError.message ?? JSON.stringify(selectedActionError));
      }

      if (selectedAction && extractArtifact(selectedAction as Record<string, unknown>)) {
        action = selectedAction as Record<string, unknown>;
      }
    }

    let contextGreeting: string | null = null;
    let accountCreatedAt: string | null = null;

    if (!action) {
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

      return jsonNoStore({
        context_greeting: contextGreeting,
        account_created_at: accountCreatedAt,
        approved_count: consumedFreeArtifactCount,
        is_subscribed: proUnlocked,
        free_artifact_remaining: freeArtifactRemaining,
        artifact_paywall_locked: false,
      });
    }

    const artifact = extractArtifact(action as Record<string, unknown>);
    const artifactPaywallLocked = Boolean(artifact) && !proUnlocked && !freeArtifactRemaining;

    // Map DB row → ConvictionAction shape
    return jsonNoStore({
      id:              action.id,
      userId,
      directive:       action.directive_text,
      action_type:     action.action_type,
      confidence:      action.confidence,
      reason:          action.reason,
      evidence:        action.evidence ?? [],
      status:          action.status,
      generatedAt:     action.generated_at,
      approvedAt:      action.approved_at ?? undefined,
      executedAt:      action.executed_at ?? undefined,
      executionResult: action.execution_result ?? undefined,
      artifact,
      context_greeting: contextGreeting,
      account_created_at: accountCreatedAt,
      approved_count: consumedFreeArtifactCount,
      is_subscribed: proUnlocked,
      free_artifact_remaining: freeArtifactRemaining,
      artifact_paywall_locked: artifactPaywallLocked,
    });
  } catch (err: unknown) {
    return apiErrorForRoute(err, 'conviction/latest');
  }
}
