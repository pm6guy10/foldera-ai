/**
 * POST /api/conviction/execute
 * Body: { action_id: string, decision: "approve" | "skip" }
 *
 * If decision === "approve":
 *   - Sets tkg_actions status → approved, approved_at → now
 *   - Routes to the correct action stub based on action_type
 *   - Sets status → executed on success
 *
 * If decision === "skip":
 *   - Sets tkg_actions status → skipped (negative training signal)
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createClient } from '@supabase/supabase-js';
import { getAuthOptions } from '@/lib/auth/auth-options';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: Request) {
  // Auth
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
    userId = session.user.id;
  }
  if (!userId) return NextResponse.json({ error: 'User ID not resolved' }, { status: 500 });

  const body = await request.json().catch(() => ({}));
  const { action_id, decision } = body as { action_id?: string; decision?: string };

  if (!action_id) return NextResponse.json({ error: 'action_id required' }, { status: 400 });
  if (!['approve', 'skip'].includes(decision ?? '')) {
    return NextResponse.json({ error: 'decision must be "approve" or "skip"' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Fetch the action
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
      .update({ status: 'skipped' })
      .eq('id', action_id);
    return NextResponse.json({ status: 'skipped', action_id });
  }

  // Approve → mark approved
  await supabase
    .from('tkg_actions')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', action_id);

  // Route to stub
  let executionResult: Record<string, unknown> = {};
  try {
    executionResult = await runStub(action.action_type as string, action);
  } catch (err: any) {
    console.error('[conviction/execute] stub error:', err.message);
    return NextResponse.json({ error: `Stub failed: ${err.message}` }, { status: 500 });
  }

  // Mark executed
  await supabase
    .from('tkg_actions')
    .update({
      status:           'executed',
      executed_at:      new Date().toISOString(),
      execution_result: executionResult,
    })
    .eq('id', action_id);

  return NextResponse.json({ status: 'executed', action_id, result: executionResult });
}

// ---------------------------------------------------------------------------
// Stub router — calls the appropriate action handler
// ---------------------------------------------------------------------------

async function runStub(
  action_type: string,
  action: Record<string, unknown>
): Promise<Record<string, unknown>> {
  switch (action_type) {
    case 'write_document':
      return stubWriteDocument(action);
    case 'send_message':
      return stubSendMessage(action);
    case 'make_decision':
      return stubMakeDecision(action);
    case 'do_nothing':
      return stubDoNothing(action);
    case 'schedule':
      return stubSchedule(action);
    case 'research':
      return stubResearch(action);
    default:
      return { message: `No stub for action_type: ${action_type}` };
  }
}

// ---------------------------------------------------------------------------
// Action stubs — each does something visible, logs outcome
// ---------------------------------------------------------------------------

async function stubWriteDocument(action: Record<string, unknown>) {
  const title = String(action.directive_text ?? 'Untitled Document');
  // In production: create a Google Doc / Notion page and return URL.
  // Stub: return the title + a placeholder URL so the UI can open it.
  return {
    action_type: 'write_document',
    document_title: title,
    document_url: null, // would be populated by real integration
    message: `Document stub created: "${title}". Connect Google Docs or Notion to open automatically.`,
    stub: true,
  };
}

async function stubSendMessage(action: Record<string, unknown>) {
  const directive = String(action.directive_text ?? '');
  const evidence = (action.evidence as any[]) ?? [];
  // Surface the drafted message text for user review before sending.
  return {
    action_type: 'send_message',
    draft: directive,
    recipient_hint: evidence.find(e => e.type === 'signal')?.description ?? null,
    message: 'Message drafted for review. Connect Gmail or Slack to send directly.',
    stub: true,
  };
}

async function stubMakeDecision(action: Record<string, unknown>) {
  const evidence = (action.evidence as any[]) ?? [];
  return {
    action_type: 'make_decision',
    decision_prompt: action.directive_text,
    historical_evidence: evidence,
    message: `Decision logged: "${action.directive_text}". The engine has committed you to this path. Revisit tkg_actions if you change course.`,
    stub: true,
  };
}

async function stubDoNothing(action: Record<string, unknown>) {
  const recheckDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    action_type: 'do_nothing',
    recheck_date: recheckDate,
    message: `Approved: do nothing. Recheck scheduled for ${recheckDate}. The engine will resurface this if the situation changes.`,
    stub: true,
  };
}

async function stubSchedule(action: Record<string, unknown>) {
  return {
    action_type: 'schedule',
    task: action.directive_text,
    calendar_url: null, // would be Google Calendar event URL
    message: `Calendar block stub: "${action.directive_text}". Connect Google Calendar to create the event automatically.`,
    stub: true,
  };
}

async function stubResearch(action: Record<string, unknown>) {
  return {
    action_type: 'research',
    research_prompt: action.directive_text,
    message: `Research task logged: "${action.directive_text}". The engine is waiting for you to return with findings before recommending the next action.`,
    stub: true,
  };
}
