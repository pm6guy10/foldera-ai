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
import { apiError } from '@/lib/utils/api-error';
import { buildContextGreeting } from '@/lib/briefing/context-builder';

export const dynamic = 'force-dynamic';


export async function GET(request: Request) {
  // Auth
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const supabase = createServerClient();

    // Prefer most recent pending_approval
    const { data: action, error } = await supabase
      .from('tkg_actions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending_approval')
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    // Build context greeting (runs even if no action, for empty state)
    let contextGreeting: string;
    try {
      contextGreeting = await buildContextGreeting(userId);
    } catch {
      contextGreeting = 'Today. 0 active commitments. Top priority: None set.';
    }

    if (!action) {
      return NextResponse.json({ context_greeting: contextGreeting }, { status: 200 });
    }

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
      artifact:        action.artifact ?? undefined,
      context_greeting: contextGreeting,
    });
  } catch (err: unknown) {
    return apiError(err, 'conviction/latest');
  }
}
