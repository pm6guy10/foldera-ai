/**
 * POST /api/drafts/decide
 * Body: { draft_id: string, decision: "approve" | "reject" }
 *
 * Unified execution layer: delegates to executeAction().
 * Approve = artifact fully executed (email, document, calendar, research, etc.).
 * Reject = skip with feedback; both paths write to tkg_signals for learning.
 *
 * Auth: session OR x-ingest-secret header.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth/auth-options';
import { executeAction } from '@/lib/conviction/execute-action';
import { shouldRunAnalysis } from '@/lib/acquisition/learning-loop';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
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

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const { draft_id, decision } = body;

  if (!draft_id || typeof draft_id !== 'string') {
    return NextResponse.json({ error: 'draft_id required' }, { status: 400 });
  }
  if (!['approve', 'reject'].includes(decision as string)) {
    return NextResponse.json({ error: 'decision must be "approve" or "reject"' }, { status: 400 });
  }

  const result = await executeAction({
    userId,
    actionId: draft_id,
    decision: decision === 'reject' ? 'reject' : 'approve',
  });

  if (result.error && result.status === 'skipped') {
    return NextResponse.json(
      { error: result.error },
      { status: result.error.includes('Cannot execute') ? 409 : 404 },
    );
  }
  if (result.status === 'draft_rejected') {
    return NextResponse.json({ draft_id: result.action_id, decision: 'reject', status: 'draft_rejected' });
  }

  const isOutreach = await checkIsOutreach(draft_id, userId);
  if (isOutreach) triggerAnalysisIfReady(userId).catch(() => {});

  return NextResponse.json({
    draft_id: result.action_id,
    decision: decision === 'reject' ? 'reject' : 'approve',
    status: result.status,
    result: result.result,
    email_sent: result.result?.sent === true,
  });
}

async function checkIsOutreach(draftId: string, userId: string): Promise<boolean> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data } = await supabase
      .from('tkg_actions')
      .select('execution_result')
      .eq('id', draftId)
      .eq('user_id', userId)
      .single();
    const exec = (data?.execution_result as Record<string, unknown>) ?? {};
    const draftType = exec.draft_type as string | undefined;
    return draftType === 'social_outreach';
  } catch {
    return false;
  }
}

async function triggerAnalysisIfReady(userId: string): Promise<void> {
  try {
    const ready = await shouldRunAnalysis(userId);
    if (!ready) return;
    const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
    fetch(`${baseUrl}/api/acquisition/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ingest-secret': process.env.INGEST_API_KEY ?? '' },
    }).catch(err => console.warn('[drafts/decide] could not trigger analysis:', err.message));
  } catch (err: unknown) {
    console.warn('[drafts/decide] analysis trigger check failed:', err instanceof Error ? err.message : err);
  }
}
