/**
 * Single execution layer for all approval paths.
 * Conviction (pending_approval) and DraftQueue (draft) both call executeAction().
 * Approve = artifact fully executed; feedback written to tkg_signals with idempotent keys.
 */

import { createServerClient, type SupabaseClient } from '@/lib/db/client';
import { hasIntegration } from '@/lib/auth/token-store';
import { sendGmailEmail } from '@/lib/integrations/gmail-client';
import { sendOutlookEmail } from '@/lib/integrations/outlook-client';
import { createGoogleCalendarEvent } from '@/lib/integrations/google-calendar';
import { createOutlookCalendarEvent } from '@/lib/integrations/outlook-calendar';

export type ExecuteDecision = 'approve' | 'skip' | 'reject';

export type SkipReason = 'not_relevant' | 'already_handled' | 'wrong_approach';

export interface ExecuteActionInput {
  userId: string;
  actionId: string;
  decision: ExecuteDecision;
  skipReason?: SkipReason;
}

export interface ExecuteActionResult {
  status: 'executed' | 'skipped' | 'draft_rejected';
  action_id: string;
  result?: Record<string, unknown>;
  error?: string;
}


/** Resolve artifact from action row: execution_result.artifact or legacy draft_type fields. */
function resolveArtifact(action: Record<string, unknown>): Record<string, unknown> | null {
  const exec = (action.execution_result as Record<string, unknown>) ?? {};
  const artifact = exec.artifact as Record<string, unknown> | undefined;
  if (artifact && typeof artifact.type === 'string') return artifact;

  const draftType = exec.draft_type as string | undefined;
  if (draftType === 'email_compose' || draftType === 'email_reply') {
    const to = exec.to as string | undefined;
    const subject = exec.subject as string | undefined;
    const body = exec.body as string | undefined;
    if (to && subject && body)
      return { type: 'email', to, subject, body, draft_type: draftType };
  }

  if (exec.type === 'document' && (exec.title != null || exec.content != null))
    return { type: 'document', title: exec.title ?? '', content: exec.content ?? '' };
  if (exec.type === 'calendar_event' || (exec.start != null && exec.end != null))
    return {
      type: 'calendar_event',
      title: exec.title ?? '',
      start: exec.start,
      end: exec.end,
      description: exec.description ?? '',
    };
  if (exec.type === 'research_brief' || (exec.findings != null || exec.recommended_action != null))
    return {
      type: 'research_brief',
      findings: exec.findings ?? '',
      sources: Array.isArray(exec.sources) ? exec.sources : [],
      recommended_action: exec.recommended_action ?? '',
    };
  if (exec.type === 'decision_frame' || (exec.recommendation != null))
    return { type: 'decision_frame', options: exec.options ?? [], recommendation: exec.recommendation ?? '' };
  if (exec.type === 'affirmation' || (exec.context != null))
    return { type: 'affirmation', context: exec.context ?? '', evidence: exec.evidence ?? '' };

  return null;
}

/** Idempotent feedback signal insert. Skips if content_hash already exists for user. */
async function insertFeedbackSignalIdempotent(
  supabase: SupabaseClient,
  userId: string,
  actionId: string,
  kind: 'approve' | 'skip',
  content: string,
): Promise<void> {
  const contentHash = kind === 'approve' ? `approve-${actionId}` : `skip-${actionId}`;
  const { data: existing } = await supabase
    .from('tkg_signals')
    .select('id')
    .eq('user_id', userId)
    .eq('content_hash', contentHash)
    .maybeSingle();

  if (existing) {
    return;
  }

  const { error } = await supabase.from('tkg_signals').insert({
    user_id: userId,
    source: 'user_feedback',
    source_id: `${kind}-${actionId}`,
    type: kind === 'approve' ? 'approval' : 'rejection',
    content,
    content_hash: contentHash,
    author: 'user',
    occurred_at: new Date().toISOString(),
  });

  if (error) {
    console.warn(`[execute-action] feedback signal insert (${kind}):`, error.message);
  }
}

/** Execute a single artifact and return execution result to merge into execution_result. */
async function executeArtifact(
  userId: string,
  artifact: Record<string, unknown>,
  actionId: string,
  supabase: SupabaseClient,
): Promise<Record<string, unknown>> {
  const type = (artifact.type as string) ?? '';
  const now = new Date().toISOString();
  let out: Record<string, unknown> = { executed_at: now };

  try {
    switch (type) {
      case 'email': {
        const to = artifact.to as string | undefined;
        const subject = artifact.subject as string | undefined;
        const body = artifact.body as string | undefined;
        if (!to || !subject || body == null) {
          out.exec_error = 'Missing to, subject, or body';
          break;
        }
        if (!/^[^@]+@[^@]+\.[^@]+$/.test(to)) {
          out.exec_error = 'Invalid email address';
          break;
        }
        const useGoogle = await hasIntegration(userId, 'google');
        const result = useGoogle
          ? await sendGmailEmail(userId, { to, subject, body })
          : await sendOutlookEmail(userId, { to, subject, body });
        if (result.success) {
          out = { ...out, sent: true, sent_at: now };
          console.log(`[execute-action] email sent for action ${actionId}`);
        } else {
          out = { ...out, sent: false, send_error: result.error };
          console.warn(`[execute-action] email send failed for ${actionId}:`, result.error);
        }
        break;
      }

      case 'document': {
        const title = (artifact.title as string) ?? 'Untitled';
        const content = (artifact.content as string) ?? '';
        const contentHash = `artifact-doc-${actionId}`;
        const { data: docRow, error: docErr } = await supabase
          .from('tkg_signals')
          .insert({
            user_id: userId,
            source: 'artifact',
            type: 'document',
            content: `Document: ${title}\n\n${content.slice(0, 50000)}`,
            content_hash: contentHash,
            author: 'foldera',
            occurred_at: now,
          })
          .select('id')
          .single();
        if (docErr) {
          if ((docErr as { code?: string }).code === '23505') {
            out = { ...out, saved: true, saved_at: now, saved_signal_id: null };
            break;
          }
          out.exec_error = docErr.message;
          console.warn('[execute-action] document save failed:', docErr.message);
        } else {
          out = { ...out, saved: true, saved_at: now, saved_signal_id: docRow?.id };
          console.log(`[execute-action] document saved for action ${actionId}`);
        }
        break;
      }

      case 'calendar_event': {
        const title = (artifact.title as string) ?? 'Event';
        const start = (artifact.start as string) ?? now;
        const end = (artifact.end as string) ?? new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const description = (artifact.description as string) ?? '';
        const useGoogle = await hasIntegration(userId, 'google');
        const result = useGoogle
          ? await createGoogleCalendarEvent(userId, { title, start, end, description })
          : await createOutlookCalendarEvent(userId, { title, start, end, description });
        if (result.success) {
          out = { ...out, created: true, event_id: result.eventId, created_at: now };
          console.log(`[execute-action] calendar event created for action ${actionId}`);
        } else {
          out = { ...out, created: false, create_error: result.error };
          console.warn(`[execute-action] calendar create failed for ${actionId}:`, result.error);
        }
        break;
      }

      case 'research_brief': {
        const recommended = (artifact.recommended_action as string) ?? '';
        const findings = (artifact.findings as string) ?? '';
        const contentHash = `artifact-research-${actionId}`;
        const { data: resRow, error: resErr } = await supabase
          .from('tkg_signals')
          .insert({
            user_id: userId,
            source: 'artifact',
            type: 'research',
            content: `Research: ${recommended}\n\nFindings: ${findings.slice(0, 50000)}`,
            content_hash: contentHash,
            author: 'foldera',
            occurred_at: now,
          })
          .select('id')
          .single();
        if (resErr) {
          if ((resErr as { code?: string }).code === '23505') {
            out = { ...out, saved: true, saved_at: now };
            break;
          }
          out.exec_error = resErr.message;
        } else {
          out = { ...out, saved: true, saved_at: now, saved_signal_id: resRow?.id };
        }
        break;
      }

      case 'decision_frame': {
        const contentHash = `artifact-decision-${actionId}`;
        const recommendation = (artifact.recommendation as string) ?? '';
        const options = (artifact.options as unknown[]) ?? [];
        const { error: decErr } = await supabase.from('tkg_signals').insert({
          user_id: userId,
          source: 'artifact',
          type: 'document',
          content: `Decision: ${recommendation}\n\nOptions: ${JSON.stringify(options).slice(0, 4000)}`,
          content_hash: contentHash,
          author: 'foldera',
          occurred_at: now,
        });
        if (decErr && (decErr as { code?: string }).code !== '23505')
          out.exec_error = decErr.message;
        else
          out = { ...out, decided: true, decided_at: now };
        break;
      }

      case 'affirmation': {
        const contentHash = `artifact-affirmation-${actionId}`;
        const context = (artifact.context as string) ?? '';
        const evidence = (artifact.evidence as string) ?? '';
        const { error: affErr } = await supabase.from('tkg_signals').insert({
          user_id: userId,
          source: 'artifact',
          type: 'document',
          content: `Affirmation: ${context}\n\nEvidence: ${evidence.slice(0, 4000)}`,
          content_hash: contentHash,
          author: 'foldera',
          occurred_at: now,
        });
        if (affErr && (affErr as { code?: string }).code !== '23505')
          out.exec_error = affErr.message;
        else
          out = { ...out, acknowledged: true, acknowledged_at: now };
        break;
      }

      default:
        out.exec_error = `Unknown artifact type: ${type}`;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    out = { ...out, exec_error: msg };
    console.error('[execute-action] artifact execution error:', msg);
  }

  return out;
}

/**
 * Single entry point for all approval/skip/reject decisions.
 * Call from /api/conviction/execute and /api/drafts/decide.
 */
export async function executeAction(input: ExecuteActionInput): Promise<ExecuteActionResult> {
  const { userId, actionId, decision, skipReason } = input;
  const supabase = createServerClient();

  const { data: action, error: fetchErr } = await supabase
    .from('tkg_actions')
    .select('*')
    .eq('id', actionId)
    .eq('user_id', userId)
    .single();

  if (fetchErr || !action) {
    return { status: 'skipped', action_id: actionId, error: 'Action not found' };
  }

  const status = action.status as string;
  const allowed = status === 'pending_approval' || status === 'draft';
  if (!allowed) {
    return { status: 'skipped', action_id: actionId, error: `Cannot execute action with status: ${status}` };
  }

  const isReject = decision === 'reject' || decision === 'skip';
  const skipStatus = status === 'draft' ? 'draft_rejected' : 'skipped';
  const skipContent = skipReason
    ? `Skipped (${skipReason}): ${action.directive_text ?? ''}\nReason: ${action.reason ?? ''}`
    : `Skipped: ${action.directive_text ?? ''}\nReason: ${action.reason ?? ''}`;

  if (isReject) {
    const update: Record<string, unknown> = {
      status: skipStatus,
      feedback_weight: -0.5,
      ...(skipReason ? { skip_reason: skipReason } : {}),
    };
    await supabase.from('tkg_actions').update(update).eq('id', actionId);

    await insertFeedbackSignalIdempotent(supabase, userId, actionId, 'skip', skipContent);
    return { status: status === 'draft' ? 'draft_rejected' : 'skipped', action_id: actionId };
  }

  await supabase
    .from('tkg_actions')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', actionId);

  const execResult = (action.execution_result as Record<string, unknown>) ?? {};
  const artifact = resolveArtifact(action as Record<string, unknown>);
  let executionResult: Record<string, unknown> = { ...execResult };

  if (artifact) {
    const run = await executeArtifact(userId, artifact, actionId, supabase);
    executionResult = { ...executionResult, ...run, artifact };
  } else {
    executionResult.exec_error = 'No artifact to execute';
    console.warn(`[execute-action] no artifact for action ${actionId}`);
  }

  await supabase
    .from('tkg_actions')
    .update({
      status: 'executed',
      executed_at: new Date().toISOString(),
      execution_result: executionResult,
      feedback_weight: 1.0,
    })
    .eq('id', actionId);

  const approvalContent = `Approved: ${action.directive_text ?? ''}\nReason: ${action.reason ?? ''}`;
  await insertFeedbackSignalIdempotent(supabase, userId, actionId, 'approve', approvalContent);

  return {
    status: 'executed',
    action_id: actionId,
    result: executionResult,
  };
}
