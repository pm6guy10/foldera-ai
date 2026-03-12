/**
 * POST /api/conviction/outcome
 * Body: { action_id: string, outcome: "worked" | "didnt_work" }
 *
 * Called after a directive has been executed and the user taps
 * "It worked" or "Didn't work". Closes the learning loop with a
 * more precise signal than approve/skip alone.
 *
 * Feedback weights:
 *   worked      → +2.0  (strong positive — pattern confirmed effective)
 *   didnt_work  → -1.5  (strong negative — pattern led to bad outcome)
 *
 * Stores outcome in execution_result JSONB so it's queryable.
 */

import { createServerClient } from '@/lib/db/client';
import { NextResponse }      from 'next/server';
import { getServerSession }  from 'next-auth';
import { getAuthOptions }    from '@/lib/auth/auth-options';
import { apiError }         from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

const WEIGHTS = { worked: 2.0, didnt_work: -1.5 } as const;
type Outcome = keyof typeof WEIGHTS;


export async function POST(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  let userId: string | undefined;
  const ingestSecret = request.headers.get('x-ingest-secret');
  if (ingestSecret) {
    if (ingestSecret !== process.env.INGEST_API_KEY) {
      return NextResponse.json({ error: 'Invalid ingest secret' }, { status: 401 });
    }
    userId = process.env.INGEST_USER_ID;
  } else {
    const session = await getServerSession(getAuthOptions());
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = process.env.INGEST_USER_ID ?? session.user.id;
  }
  if (!userId) return NextResponse.json({ error: 'User ID not resolved' }, { status: 500 });

  // ── Parse body ──────────────────────────────────────────────────────────────
  const body = await request.json().catch(() => ({})) as {
    action_id?: string;
    outcome?:   string;
  };

  const { action_id, outcome } = body;

  if (!action_id) {
    return NextResponse.json({ error: 'action_id required' }, { status: 400 });
  }
  if (!outcome || !(outcome in WEIGHTS)) {
    return NextResponse.json(
      { error: 'outcome must be "worked" or "didnt_work"' },
      { status: 400 },
    );
  }

  const supabase = createServerClient();

  // ── Fetch the action ────────────────────────────────────────────────────────
  const { data: action, error: fetchErr } = await supabase
    .from('tkg_actions')
    .select('id, status, execution_result')
    .eq('id', action_id)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !action) {
    return NextResponse.json({ error: 'Action not found' }, { status: 404 });
  }

  if (action.status !== 'executed') {
    return NextResponse.json(
      { error: 'Can only confirm outcome of executed actions' },
      { status: 409 },
    );
  }

  // ── Write outcome ───────────────────────────────────────────────────────────
  const updatedResult = {
    ...(action.execution_result as Record<string, unknown> ?? {}),
    outcome,
    outcome_confirmed_at: new Date().toISOString(),
  };

  const { error: updateErr } = await supabase
    .from('tkg_actions')
    .update({
      feedback_weight:  WEIGHTS[outcome as Outcome],
      execution_result: updatedResult,
    })
    .eq('id', action_id);

  if (updateErr) {
    return apiError(updateErr, 'conviction/outcome');
  }

  console.log(`[conviction/outcome] ${action_id} → ${outcome} (weight ${WEIGHTS[outcome as Outcome]})`);
  return NextResponse.json({ action_id, outcome, feedback_weight: WEIGHTS[outcome as Outcome] });
}
