/**
 * POST /api/drafts/decide
 *
 * Approves or rejects a pending draft action.
 *
 * Body: { draft_id: string, decision: "approve" | "reject" }
 *
 * - approve → status: 'approved', feedback_weight: +1.0
 *             (execution of the actual action — email send, etc. — will be
 *              wired here when integrations are live; for now we mark approved)
 * - reject  → status: 'draft_rejected', feedback_weight: -0.5
 *
 * Returns: { draft_id, decision, status }
 *
 * Auth: session OR x-ingest-secret header.
 */

import { NextResponse }     from 'next/server';
import { getServerSession } from 'next-auth';
import { createClient }     from '@supabase/supabase-js';
import { getAuthOptions }   from '@/lib/auth/auth-options';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

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
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const { draft_id, decision } = body;

  if (!draft_id || typeof draft_id !== 'string') {
    return NextResponse.json({ error: 'draft_id required' }, { status: 400 });
  }
  if (!['approve', 'reject'].includes(decision as string)) {
    return NextResponse.json(
      { error: 'decision must be "approve" or "reject"' },
      { status: 400 },
    );
  }

  const supabase = getSupabase();

  // ── Verify ownership and current status ─────────────────────────────────────
  const { data: row, error: fetchErr } = await supabase
    .from('tkg_actions')
    .select('id, status, action_type, execution_result')
    .eq('id', draft_id)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !row) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  }
  if (row.status !== 'draft') {
    return NextResponse.json(
      { error: `Cannot decide on action with status: ${row.status}` },
      { status: 409 },
    );
  }

  // ── Apply decision ──────────────────────────────────────────────────────────
  if (decision === 'reject') {
    await supabase
      .from('tkg_actions')
      .update({ status: 'draft_rejected', feedback_weight: -0.5 })
      .eq('id', draft_id);

    console.log(`[drafts/decide] ${draft_id} rejected`);
    return NextResponse.json({ draft_id, decision: 'reject', status: 'draft_rejected' });
  }

  // approve — mark approved + (stub) execution
  // When real integrations exist, fire the actual action here based on action_type.
  // For now: mark approved + update execution_result with approval note.
  const now = new Date().toISOString();
  const updatedResult = {
    ...((row.execution_result as Record<string, unknown>) ?? {}),
    approved_at:  now,
    executed_at:  now,
    execution:    'stub — approval recorded; real execution pending integration wiring',
    stub:         true,
  };

  await supabase
    .from('tkg_actions')
    .update({
      status:           'approved',
      approved_at:      now,
      executed_at:      now,
      feedback_weight:  1.0,
      execution_result: updatedResult,
    })
    .eq('id', draft_id);

  console.log(`[drafts/decide] ${draft_id} approved (${row.action_type})`);
  return NextResponse.json({ draft_id, decision: 'approve', status: 'approved' });
}
