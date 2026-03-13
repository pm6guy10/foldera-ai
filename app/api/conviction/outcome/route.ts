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

import { createHash }        from 'crypto';
import { createServerClient } from '@/lib/db/client';
import { resolveUser } from '@/lib/auth/resolve-user';
import { NextResponse }      from 'next/server';
import { apiError }         from '@/lib/utils/api-error';
import { encrypt }          from '@/lib/encryption';

export const dynamic = 'force-dynamic';

const WEIGHTS = { worked: 2.0, didnt_work: -1.5 } as const;
type Outcome = keyof typeof WEIGHTS;


export async function POST(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

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
    .select('id, status, execution_result, action_type, directive_text')
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

  // ── Write outcome signal to tkg_signals ─────────────────────────────────────
  // This makes confirmed outcomes visible in the signal stream for prompt injection.
  const outcomeLabel = outcome === 'worked' ? 'CONFIRMED_WORKED' : 'CONFIRMED_DIDNT_WORK';
  const signalContent = `Outcome confirmed: ${outcomeLabel} — ${action.action_type ?? 'action'}: ${(action.directive_text as string ?? '').slice(0, 200)}`;

  const { error: signalErr } = await supabase
    .from('tkg_signals')
    .insert({
      user_id:      userId,
      source:       'user_feedback',
      source_id:    action_id,
      type:         'outcome_feedback',
      content:      encrypt(signalContent),
      content_hash: createHash('sha256').update(`outcome:${action_id}:${outcome}`).digest('hex'),
      author:       'user',
      recipients:   [],
      occurred_at:  new Date().toISOString(),
      processed:    true,
      outcome_label: outcomeLabel,
    });

  if (signalErr) {
    // Non-fatal — log but don't fail the response
    console.warn(`[conviction/outcome] signal write failed: ${signalErr.message}`);
  }

  console.log(`[conviction/outcome] ${action_id} → ${outcome} (weight ${WEIGHTS[outcome as Outcome]})`);
  return NextResponse.json({ action_id, outcome, feedback_weight: WEIGHTS[outcome as Outcome] });
}
