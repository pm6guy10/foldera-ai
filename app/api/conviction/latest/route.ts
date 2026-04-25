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

function startOfTodayIso(): string {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
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

    const { data: actions, error } = await supabase
      .from('tkg_actions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending_approval')
      .order('confidence', { ascending: false })
      .order('generated_at', { ascending: false })
      .limit(20);

    if (error) {
      throw new Error(error.message ?? JSON.stringify(error));
    }

    // Build context greeting (runs even if no action, for empty state)
    let contextGreeting: string;
    try {
      contextGreeting = await buildContextGreeting(userId);
    } catch {
      contextGreeting = 'Today. 0 active commitments. Top priority: None set.';
    }

    let accountCreatedAt: string | null = null;
    try {
      const { data: userData, error: authUserError } = await supabase.auth.admin.getUserById(userId);
      if (!authUserError) {
        accountCreatedAt = userData.user?.created_at ?? null;
      }
    } catch {
      accountCreatedAt = null;
    }

    // Legacy field: count approved + pending_approval for backward compatibility.
    let approvedCount = 0;
    try {
      const { count } = await supabase
        .from('tkg_actions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', ['approved', 'pending_approval']);
      approvedCount = count ?? 0;
    } catch {
      approvedCount = 0;
    }

    // Free sample consumption: once approved/executed/skipped history exists, sample is consumed.
    let freeArtifactUsageCount = 0;
    try {
      const { count } = await supabase
        .from('tkg_actions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', ['approved', 'executed', 'skipped']);
      freeArtifactUsageCount = count ?? 0;
    } catch {
      freeArtifactUsageCount = 0;
    }

    // Subscription status for blur gate
    let isSubscribed = false;
    try {
      const sub = await getSubscriptionStatus(userId);
      isSubscribed = sub.status === 'active' || sub.status === 'active_trial' || sub.status === 'past_due';
    } catch {
      isSubscribed = false;
    }

    const candidates = actions ?? [];
    const todaysCandidates = candidates.filter((candidate) => {
      const generatedAt = typeof candidate.generated_at === 'string' ? candidate.generated_at : '';
      return generatedAt >= startOfTodayIso();
    });
    const rankedCandidates = (todaysCandidates.length > 0 ? todaysCandidates : candidates).filter((candidate) => {
      const artifact = extractArtifact(candidate as Record<string, unknown>);
      return artifact !== undefined && typeof candidate.confidence === 'number' && candidate.confidence >= MIN_PENDING_CONFIDENCE;
    });
    const action = rankedCandidates[0];
    const freeArtifactRemaining = freeArtifactUsageCount < 1;

    if (!action) {
      return NextResponse.json({
        context_greeting: contextGreeting,
        account_created_at: accountCreatedAt,
        approved_count: approvedCount,
        is_subscribed: isSubscribed,
        free_artifact_remaining: freeArtifactRemaining,
        artifact_paywall_locked: false,
      }, { status: 200 });
    }

    const artifact = extractArtifact(action as Record<string, unknown>);
    const artifactPaywallLocked = !isSubscribed && Boolean(artifact) && !freeArtifactRemaining;

    // Map DB row → ConvictionAction shape
    return NextResponse.json({
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
      approved_count:  approvedCount,
      is_subscribed:   isSubscribed,
      free_artifact_remaining: freeArtifactRemaining,
      artifact_paywall_locked: artifactPaywallLocked,
    });
  } catch (err: unknown) {
    return apiErrorForRoute(err, 'conviction/latest');
  }
}
