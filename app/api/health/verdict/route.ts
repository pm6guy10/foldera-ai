/**
 * GET /api/health/verdict
 *
 * Returns the latest system_health row for the authenticated user.
 * Used by the dashboard for a system status line and by the morning email for context.
 *
 * Auth: session-backed (resolveUser).
 */

import { NextRequest, NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('system_health')
    .select(
      'id, created_at, run_type, sync_healthy, processing_healthy, generation_healthy, delivery_healthy, signals_synced, signals_processed, signals_unprocessed, candidates_evaluated, winner_action_type, winner_confidence, winner_persisted, winner_status, gate_that_blocked, email_sent, same_candidate_streak, streak_candidate_desc, failure_class, failure_detail, suggested_fix, cursor_prompt_ref',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    // PGRST116 = no rows found — not a real error
    if (error.code === 'PGRST116') {
      return NextResponse.json({ verdict: null });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ verdict: data });
}
