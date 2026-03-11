/**
 * POST /api/conviction/execute
 * Body: { action_id: string, decision: "approve" | "skip" }
 *
 * On approve of email_compose / email_reply actions, sends the email via
 * Gmail or Outlook based on the user's connected provider.
 */

import { NextResponse }      from 'next/server';
import { getServerSession }  from 'next-auth';
import { createClient }      from '@supabase/supabase-js';
import { getAuthOptions }    from '@/lib/auth/auth-options';
import { sendGmailEmail }    from '@/lib/integrations/gmail-client';
import { sendOutlookEmail }  from '@/lib/integrations/outlook-client';
import { hasIntegration }    from '@/lib/auth/token-store';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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

  const body = await request.json().catch(() => ({}));
  const { action_id, decision } = body as { action_id?: string; decision?: string };

  if (!action_id) return NextResponse.json({ error: 'action_id required' }, { status: 400 });
  if (!['approve', 'skip'].includes(decision ?? '')) {
    return NextResponse.json({ error: 'decision must be "approve" or "skip"' }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: action, error: fetchErr } = await supabase
    .from('tkg_actions')
    .select('*')
    .eq('id', action_id)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !action) {
    return NextResponse.json({ error: 'Action not found' }, { status: 404 });
  }

  if (decision === 'skip') {
    await supabase
      .from('tkg_actions')
      .update({ status: 'skipped', feedback_weight: -0.5 })
      .eq('id', action_id);

    // Self-feeding loop: write skip as a behavioral signal
    await supabase.from('tkg_signals').insert({
      user_id: userId,
      source: 'user_feedback',
      type: 'rejection',
      content: `Skipped: ${action.directive_text ?? ''}\nReason: ${action.reason ?? ''}`,
      occurred_at: new Date().toISOString(),
    }).then(({ error: sigErr }) => {
      if (sigErr) console.warn('[conviction/execute] feedback signal insert failed:', sigErr.message);
    });

    return NextResponse.json({ status: 'skipped', action_id });
  }

  await supabase
    .from('tkg_actions')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', action_id);

  let executionResult: Record<string, unknown> = {};
  try {
    executionResult = await runStub(action.action_type as string, action);
  } catch (err: any) {
    console.error('[conviction/execute] stub error:', err.message);
    return NextResponse.json({ error: `Stub failed: ${err.message}` }, { status: 500 });
  }

  // Wire email send for email_compose / email_reply action types
  const execResult = (action.execution_result as Record<string, unknown>) ?? {};
  const draftType  = execResult.draft_type as string | undefined;
  if (draftType === 'email_compose' || draftType === 'email_reply') {
    const to      = execResult.to as string | undefined;
    const subject = execResult.subject as string | undefined;
    const msgBody = execResult.body as string | undefined;

    if (to && subject && msgBody && /^[^@]+@[^@]+\.[^@]+$/.test(to)) {
      const useGoogle = await hasIntegration(userId, 'google');
      const result = useGoogle
        ? await sendGmailEmail(userId, { to, subject, body: msgBody })
        : await sendOutlookEmail(userId, { to, subject, body: msgBody });

      const now = new Date().toISOString();
      executionResult = result.success
        ? { ...executionResult, sent: true, sent_at: now }
        : { ...executionResult, sent: false, send_error: result.error };
    }
  }

  await supabase
    .from('tkg_actions')
    .update({
      status:           'executed',
      executed_at:      new Date().toISOString(),
      execution_result: executionResult,
      feedback_weight:  1.0,
    })
    .eq('id', action_id);

  // Self-feeding loop: write approval as a behavioral signal
  await supabase.from('tkg_signals').insert({
    user_id: userId,
    source: 'user_feedback',
    type: 'approval',
    content: `Approved: ${action.directive_text ?? ''}\nReason: ${action.reason ?? ''}`,
    occurred_at: new Date().toISOString(),
  }).then(({ error: sigErr }) => {
    if (sigErr) console.warn('[conviction/execute] feedback signal insert failed:', sigErr.message);
  });

  return NextResponse.json({ status: 'executed', action_id, result: executionResult });
}

// ---------------------------------------------------------------------------

async function runStub(action_type: string, action: Record<string, unknown>): Promise<Record<string, unknown>> {
  switch (action_type) {
    case 'write_document': {
      const title = String(action.directive_text ?? 'Untitled Document');
      return { action_type: 'write_document', document_title: title, document_url: null, stub: true };
    }
    case 'send_message': {
      const directive = String(action.directive_text ?? '');
      const evidence = (action.evidence as any[]) ?? [];
      return {
        action_type: 'send_message',
        draft: directive,
        recipient_hint: evidence.find((e: any) => e.type === 'signal')?.description ?? null,
        stub: true,
      };
    }
    case 'make_decision':
      return { action_type: 'make_decision', decision_prompt: action.directive_text, stub: true };
    case 'do_nothing': {
      const recheckDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return { action_type: 'do_nothing', recheck_date: recheckDate, stub: true };
    }
    case 'schedule':
      return { action_type: 'schedule', task: action.directive_text, calendar_url: null, stub: true };
    case 'research':
      return { action_type: 'research', research_prompt: action.directive_text, stub: true };
    default:
      return { message: `No stub for action_type: ${action_type}` };
  }
}
