/**
 * POST /api/drafts/decide
 *
 * Approves or rejects a pending draft action.
 * On approval of email_compose / email_reply drafts, sends the email via
 * Gmail or Outlook based on the user's connected provider.
 *
 * Auth: session OR x-ingest-secret header.
 */

import { NextResponse }          from 'next/server';
import { getServerSession }      from 'next-auth';
import { createClient }          from '@supabase/supabase-js';
import { getAuthOptions }        from '@/lib/auth/auth-options';
import { shouldRunAnalysis }     from '@/lib/acquisition/learning-loop';
import { sendGmailEmail }        from '@/lib/integrations/gmail-client';
import { sendOutlookEmail }      from '@/lib/integrations/outlook-client';
import { hasIntegration }        from '@/lib/auth/token-store';

export const dynamic = 'force-dynamic';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: Request) {
  // -- Auth ---------------------------------------------------------------
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

  // -- Parse body ---------------------------------------------------------
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const { draft_id, decision } = body;

  if (!draft_id || typeof draft_id !== 'string') {
    return NextResponse.json({ error: 'draft_id required' }, { status: 400 });
  }
  if (!['approve', 'reject'].includes(decision as string)) {
    return NextResponse.json({ error: 'decision must be "approve" or "reject"' }, { status: 400 });
  }

  const supabase = getSupabase();

  // -- Verify ownership and current status --------------------------------
  const { data: row, error: fetchErr } = await supabase
    .from('tkg_actions')
    .select('id, status, action_type, execution_result')
    .eq('id', draft_id)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !row) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
  if (row.status !== 'draft') {
    return NextResponse.json({ error: `Cannot decide on action with status: ${row.status}` }, { status: 409 });
  }

  const execResult = (row.execution_result as Record<string, unknown>) ?? {};
  const draftType  = execResult.draft_type as string | undefined;
  const isOutreach = draftType === 'social_outreach';
  const isEmail    = draftType === 'email_compose' || draftType === 'email_reply';

  // -- Reject -------------------------------------------------------------
  if (decision === 'reject') {
    await supabase
      .from('tkg_actions')
      .update({ status: 'draft_rejected', feedback_weight: -0.5 })
      .eq('id', draft_id);

    console.log(`[drafts/decide] ${draft_id} rejected (${draftType ?? 'non-outreach'})`);
    if (isOutreach) triggerAnalysisIfReady(userId).catch(() => {});
    return NextResponse.json({ draft_id, decision: 'reject', status: 'draft_rejected' });
  }

  // -- Approve ------------------------------------------------------------
  const now = new Date().toISOString();
  let emailSendResult: { sent: boolean; sent_at?: string; send_error?: string } = { sent: false };

  if (isEmail) {
    const to      = execResult.to as string | undefined;
    const subject = execResult.subject as string | undefined;
    const msgBody = execResult.body as string | undefined;

    if (to && subject && msgBody && /^[^@]+@[^@]+\.[^@]+$/.test(to)) {
      // Determine provider
      const useGoogle    = await hasIntegration(userId, 'google');
      const useMicrosoft = !useGoogle && await hasIntegration(userId, 'azure_ad');

      let result: { success: boolean; messageId?: string; error?: string } = { success: false, error: 'No email integration found' };

      if (useGoogle) {
        result = await sendGmailEmail(userId, { to, subject, body: msgBody });
      } else if (useMicrosoft) {
        result = await sendOutlookEmail(userId, { to, subject, body: msgBody });
      }

      if (result.success) {
        emailSendResult = { sent: true, sent_at: now };
        console.log(`[drafts/decide] email sent for ${draft_id} via ${useGoogle ? 'gmail' : 'outlook'}`);
      } else {
        emailSendResult = { sent: false, send_error: result.error };
        console.warn(`[drafts/decide] email send failed for ${draft_id}: ${result.error}`);
      }
    }
  }

  const updatedResult = {
    ...execResult,
    approved_at: now,
    executed_at: now,
    ...emailSendResult,
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

  console.log(`[drafts/decide] ${draft_id} approved (${draftType ?? row.action_type})`);
  if (isOutreach) triggerAnalysisIfReady(userId).catch(() => {});

  return NextResponse.json({ draft_id, decision: 'approve', status: 'approved', email_sent: emailSendResult.sent });
}

// -- Learning loop trigger ------------------------------------------------

async function triggerAnalysisIfReady(userId: string): Promise<void> {
  try {
    const ready = await shouldRunAnalysis(userId);
    if (!ready) return;
    const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
    fetch(`${baseUrl}/api/acquisition/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ingest-secret': process.env.INGEST_API_KEY ?? '' },
    }).catch(err => console.warn('[drafts/decide] could not trigger analysis:', err.message));
    console.log('[drafts/decide] analysis triggered');
  } catch (err: any) {
    console.warn('[drafts/decide] analysis trigger check failed:', err.message);
  }
}
