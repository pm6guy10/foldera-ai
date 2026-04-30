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
import { encrypt } from '@/lib/encryption';
import { truncateSignalContent } from '@/lib/utils/signal-egress';
import {
  renderPlaintextEmailHtml,
  renderWriteDocumentReadyEmailHtml,
  sendResendEmail,
} from '@/lib/email/resend';
import { getVerifiedDailyBriefRecipientEmail } from '@/lib/auth/daily-brief-users';
import { updateMlSnapshotOutcome } from '@/lib/ml/directive-ml-snapshot';
import { reinforceAttentionForAction } from '@/lib/signals/entity-attention-runtime';

export type ExecuteDecision = 'approve' | 'skip' | 'reject';

export type SkipReason = 'not_relevant' | 'already_handled' | 'wrong_approach';

export interface ExecuteActionInput {
  userId: string;
  actionId: string;
  decision: ExecuteDecision;
  skipReason?: SkipReason;
  /** Optional caller-supplied artifact that overrides the one stored in the DB row. */
  editedArtifact?: Record<string, unknown>;
}

export interface ExecuteActionResult {
  status: 'executed' | 'skipped' | 'draft_rejected' | 'failed';
  action_id: string;
  /** Present on executed so clients can show action-specific success copy without re-fetching. */
  action_type?: string;
  result?: Record<string, unknown>;
  error?: string;
}

function executionSucceeded(
  artifact: Record<string, unknown>,
  executionResult: Record<string, unknown>,
): boolean {
  if (typeof executionResult.exec_error === 'string' && executionResult.exec_error.length > 0) {
    return false;
  }

  switch (artifact.type) {
    case 'email':
      return executionResult.sent === true;
    case 'document':
      return executionResult.saved === true;
    case 'calendar_event':
      return executionResult.created === true;
    case 'research_brief':
      return executionResult.saved === true;
    case 'decision_frame':
      return executionResult.decided === true;
    case 'wait_rationale':
    case 'affirmation':
      return executionResult.saved === true;
    default:
      return false;
  }
}

/**
 * When a user skips a directive, suppress any commitment that sourced it.
 * Reads execution_result.generation_log.candidateDiscovery.topCandidates[0].sourceSignals
 * and marks matching tkg_commitments as suppressed.
 */
async function suppressCommitmentsForSkippedAction(
  supabase: SupabaseClient,
  action: Record<string, unknown>,
): Promise<void> {
  try {
    const execResult = action.execution_result as Record<string, unknown> | null;
    if (!execResult) return;

    const genLog = execResult.generation_log as Record<string, unknown> | undefined;
    if (!genLog) return;

    const discovery = genLog.candidateDiscovery as Record<string, unknown> | undefined;
    if (!discovery) return;

    const topCandidates = discovery.topCandidates as Array<Record<string, unknown>> | undefined;
    if (!topCandidates?.length) return;

    // The selected candidate is the one that was shown to the user
    const selected = topCandidates.find((c) => c.decision === 'selected') ?? topCandidates[0];
    const sourceSignals = selected.sourceSignals as Array<Record<string, unknown>> | undefined;
    if (!sourceSignals?.length) return;

    const commitmentIds = sourceSignals
      .filter((s) => s.kind === 'commitment' && typeof s.id === 'string')
      .map((s) => s.id as string);

    if (commitmentIds.length === 0) return;

    // Only suppress after 3+ skips for the same commitment.
    // Count how many skipped actions reference each commitment.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: skippedActions } = await supabase
      .from('tkg_actions')
      .select('execution_result')
      .eq('user_id', action.user_id as string)
      .gte('generated_at', thirtyDaysAgo)
      .in('status', ['skipped', 'draft_rejected', 'rejected'])
      .limit(100);

    const skipCountByCommitment: Record<string, number> = {};
    for (const sa of skippedActions ?? []) {
      const er = sa.execution_result as Record<string, unknown> | null;
      const gl = er?.generation_log as Record<string, unknown> | undefined;
      const disc = gl?.candidateDiscovery as Record<string, unknown> | undefined;
      const tc = disc?.topCandidates as Array<Record<string, unknown>> | undefined;
      const sel = tc?.find((c) => c.decision === 'selected') ?? tc?.[0];
      const ss = sel?.sourceSignals as Array<Record<string, unknown>> | undefined;
      for (const sig of ss ?? []) {
        if (sig.kind === 'commitment' && typeof sig.id === 'string') {
          skipCountByCommitment[sig.id] = (skipCountByCommitment[sig.id] ?? 0) + 1;
        }
      }
    }

    // Include the current skip (+1) since this action is being skipped now
    const toSuppress = commitmentIds.filter(
      (id) => (skipCountByCommitment[id] ?? 0) + 1 >= 3,
    );

    if (toSuppress.length === 0) return;

    const { error } = await supabase
      .from('tkg_commitments')
      .update({
        suppressed_at: new Date().toISOString(),
        suppressed_reason: 'user_skipped_directive_3x',
      })
      .in('id', toSuppress);

    if (error) {
      console.warn('[execute-action] Failed to suppress commitments:', error.message);
    }
  } catch {
    // Non-fatal — don't break skip flow if suppression fails
  }
}

/** Resolve artifact from action row: execution_result.artifact or legacy draft_type fields. */
function resolveArtifact(action: Record<string, unknown>): Record<string, unknown> | null {
  const exec = (action.execution_result as Record<string, unknown>) ?? {};
  const artifact = exec.artifact as Record<string, unknown> | undefined;
  if (artifact && typeof artifact === 'object') {
    const artifactType = typeof artifact.type === 'string' ? artifact.type : '';
    if (action.action_type === 'send_message' && (artifactType === 'send_message' || artifactType === 'email' || artifactType === 'drafted_email' || artifactType === '')) {
      const recipient = artifact.to ?? artifact.recipient;
      return {
        ...artifact,
        type: 'email',
        ...(recipient ? { to: recipient } : {}),
        ...(recipient ? { recipient } : {}),
      };
    }

    if (typeof artifact.type === 'string') {
      return artifact;
    }
  }

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
  if (exec.type === 'wait_rationale' || exec.type === 'affirmation' || (exec.context != null))
    return {
      type: 'wait_rationale',
      context: exec.context ?? '',
      evidence: exec.evidence ?? '',
      tripwires: Array.isArray(exec.tripwires) ? exec.tripwires : [],
    };

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
    content: encrypt(truncateSignalContent(content)),
    content_hash: contentHash,
    author: 'user',
    occurred_at: new Date().toISOString(),
  });

  if (error) {
    console.warn(`[execute-action] feedback signal insert (${kind}):`, error.message);
  }
}

type ExecuteArtifactOptions = {
  actionType?: string;
  /** Daily brief / dashboard directive line — used as Resend subject for write_document delivery. */
  directiveTitle?: string | null;
};

/** Execute a single artifact and return execution result to merge into execution_result. */
async function executeArtifact(
  userId: string,
  artifact: Record<string, unknown>,
  actionId: string,
  supabase: SupabaseClient,
  options?: ExecuteArtifactOptions,
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
        const gmailThreadId =
          typeof artifact.gmail_thread_id === 'string' ? artifact.gmail_thread_id : undefined;
        const inReplyTo =
          typeof artifact.in_reply_to === 'string'
            ? artifact.in_reply_to
            : typeof artifact.inReplyTo === 'string'
              ? artifact.inReplyTo
              : undefined;
        const references =
          typeof artifact.references === 'string' ? artifact.references : undefined;
        if (options?.actionType === 'send_message') {
          // Safety gate: actual email sending requires ALLOW_EMAIL_SEND=true in env.
          // Without it, Approve marks the action executed but no email is dispatched.
          if (process.env.ALLOW_EMAIL_SEND !== 'true') {
            out = { ...out, sent: false, sent_via: null, reason: 'email_send_disabled' };
            console.log(`[execute-action] email send skipped for ${actionId} — ALLOW_EMAIL_SEND not set`);
          } else {

          // Prefer the user's mailbox (Gmail / Outlook) so recipients see the customer, not noreply@foldera.ai.
          let sentViaProvider = false;
          let providerError: string | undefined;

          if (await hasIntegration(userId, 'google')) {
            const gmailResult = await sendGmailEmail(userId, {
              to,
              subject,
              body,
              threadId: gmailThreadId ?? null,
              inReplyTo: inReplyTo ?? null,
              references: references ?? null,
            });
            if (gmailResult.success) {
              out = { ...out, sent: true, sent_at: now, sent_via: 'gmail' };
              sentViaProvider = true;
              console.log(`[execute-action] gmail send for action ${actionId}`);
            } else {
              providerError = gmailResult.error;
              console.warn(`[execute-action] gmail send failed for ${actionId}:`, gmailResult.error);
            }
          }

          if (!sentViaProvider && (await hasIntegration(userId, 'azure_ad'))) {
            const outlookResult = await sendOutlookEmail(userId, {
              to,
              subject,
              body,
              inReplyTo: inReplyTo ?? null,
              references: references ?? null,
            });
            if (outlookResult.success) {
              out = { ...out, sent: true, sent_at: now, sent_via: 'outlook' };
              sentViaProvider = true;
              console.log(`[execute-action] outlook send for action ${actionId}`);
            } else {
              providerError = outlookResult.error ?? providerError;
              console.warn(`[execute-action] outlook send failed for ${actionId}:`, outlookResult.error);
            }
          }

          if (!sentViaProvider) {
            const delivery = await sendResendEmail({
              to,
              subject,
              text: body,
              html: renderPlaintextEmailHtml(body),
              tags: [
                { name: 'email_type', value: 'approved_send_message' },
                { name: 'user_id', value: userId },
                { name: 'action_id', value: actionId },
              ],
            });
            const resendError =
              delivery && typeof delivery === 'object' && 'error' in delivery
                ? (delivery as { error?: { message?: string } | null }).error
                : null;
            const resendId =
              delivery && typeof delivery === 'object' && 'data' in delivery && typeof (delivery as { data?: { id?: unknown } }).data?.id === 'string'
                ? ((delivery as { data?: { id?: string } }).data?.id ?? null)
                : null;

            if (resendError || !resendId) {
              const sendError = resendError?.message ?? providerError ?? 'Resend send failed';
              out = { ...out, sent: false, resend_id: resendId, send_error: sendError, exec_error: sendError };
              console.warn(`[execute-action] resend send failed for ${actionId}:`, sendError);
            } else {
              out = { ...out, sent: true, sent_at: now, resend_id: resendId, sent_via: 'resend' };
              console.log(`[execute-action] resend email sent for action ${actionId}`);
            }
          }
          } // end ALLOW_EMAIL_SEND else
        } else {
          const useGoogle = await hasIntegration(userId, 'google');
          const result = useGoogle
            ? await sendGmailEmail(userId, {
                to,
                subject,
                body,
                threadId: gmailThreadId ?? null,
                inReplyTo: inReplyTo ?? null,
                references: references ?? null,
              })
            : await sendOutlookEmail(userId, {
                to,
                subject,
                body,
                inReplyTo: inReplyTo ?? null,
                references: references ?? null,
              });
          if (result.success) {
            out = { ...out, sent: true, sent_at: now };
            console.log(`[execute-action] email sent for action ${actionId}`);
          } else {
            out = { ...out, sent: false, send_error: result.error, exec_error: result.error };
            console.warn(`[execute-action] email send failed for ${actionId}:`, result.error);
          }
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
            source_id: `artifact-doc-${actionId}`,
            type: 'document',
      content: encrypt(truncateSignalContent(`Document: ${title}\n\n${content}`)),
            content_hash: contentHash,
            author: 'foldera',
            occurred_at: now,
          })
          .select('id')
          .single();
        if (docErr) {
          if ((docErr as { code?: string }).code === '23505') {
            out = { ...out, saved: true, saved_at: now, saved_signal_id: null };
          } else {
            out.exec_error = docErr.message;
            console.warn('[execute-action] document save failed:', docErr.message);
          }
        } else {
          out = { ...out, saved: true, saved_at: now, saved_signal_id: docRow?.id };
          console.log(`[execute-action] document saved for action ${actionId}`);
        }

        if (options?.actionType === 'write_document' && out.saved === true) {
          const userEmail = await getVerifiedDailyBriefRecipientEmail(userId, supabase);
          const docTitle = title;
          const docBody = content.slice(0, 50000);
          const rawSubject = (options.directiveTitle?.trim() || docTitle).replace(/\s+/g, ' ');
          const subject = rawSubject.slice(0, 200);
          const textBody = [
            'Your document is ready',
            '',
            'You approved this in Foldera. Full text is below — forward, copy, or file it.',
            '',
            `— ${docTitle}`,
            '',
            docBody,
          ].join('\n');
          if (!userEmail) {
            out.document_ready_email = { sent: false, reason: 'no_verified_email' };
            console.warn(`[execute-action] write_document delivery email skipped (no verified email) for ${actionId}`);
          } else {
            const delivery = await sendResendEmail({
              to: userEmail,
              subject,
              text: textBody,
              html: renderWriteDocumentReadyEmailHtml({
                documentTitle: docTitle,
                documentContent: docBody,
              }),
              tags: [
                { name: 'email_type', value: 'approved_write_document' },
                { name: 'user_id', value: userId },
                { name: 'action_id', value: actionId },
              ],
            });
            const resendError =
              delivery && typeof delivery === 'object' && 'error' in delivery
                ? (delivery as { error?: { message?: string } | null }).error
                : null;
            const resendId =
              delivery && typeof delivery === 'object' && 'data' in delivery && typeof (delivery as { data?: { id?: unknown } }).data?.id === 'string'
                ? ((delivery as { data?: { id?: string } }).data?.id ?? null)
                : null;
            if (resendError || !resendId) {
              const errMsg = resendError?.message ?? 'Resend send failed';
              out.document_ready_email = { sent: false, send_error: errMsg };
              console.warn(`[execute-action] write_document delivery email failed for ${actionId}:`, errMsg);
            } else {
              out.document_ready_email = { sent: true, resend_id: resendId };
              console.log(`[execute-action] write_document delivery email sent for ${actionId}`);
            }
          }
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
            source_id: `artifact-research-${actionId}`,
            type: 'research',
      content: encrypt(truncateSignalContent(`Research: ${recommended}\n\nFindings: ${findings}`)),
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
          source_id: `artifact-decision-${actionId}`,
          type: 'document',
      content: encrypt(truncateSignalContent(`Decision: ${recommendation}\n\nOptions: ${JSON.stringify(options)}`)),
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

      case 'wait_rationale':
      case 'affirmation': {
        const contentHash = `artifact-wait-${actionId}`;
        const context = (artifact.context as string) ?? '';
        const evidence = (artifact.evidence as string) ?? '';
        const tripwires = Array.isArray(artifact.tripwires)
          ? (artifact.tripwires as unknown[]).filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          : [];
        const waitBody = [
          'Wait rationale',
          '',
          `Context: ${context}`,
          '',
          `Evidence: ${evidence.slice(0, 4000)}`,
          ...(tripwires.length > 0 ? ['', `Tripwires: ${tripwires.join('; ')}`] : []),
        ].join('\n');
        const { error: affErr } = await supabase.from('tkg_signals').insert({
          user_id: userId,
          source: 'artifact',
          source_id: `artifact-wait-${actionId}`,
          type: 'document',
      content: encrypt(truncateSignalContent(waitBody)),
          content_hash: contentHash,
          author: 'foldera',
          occurred_at: now,
        });
        if (affErr && (affErr as { code?: string }).code !== '23505')
          out.exec_error = affErr.message;
        else
          out = { ...out, saved: true, saved_at: now };
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
  const { userId, actionId, decision, skipReason, editedArtifact } = input;
  const supabase = createServerClient();
  const isReject = decision === 'reject' || decision === 'skip';

  // Atomic claim: conditionally update the row only if it still has an actionable
  // status. This prevents the double-execute race condition where two concurrent
  // requests both read 'pending_approval' and both proceed to send email.
  // First, try to claim from 'pending_approval':
  let claimedStatus: 'pending_approval' | 'draft' | null = null;
  let action: Record<string, unknown> | null = null;

  for (const candidateStatus of ['pending_approval', 'draft'] as const) {
    const targetStatus = isReject
      ? (candidateStatus === 'draft' ? 'draft_rejected' : 'skipped')
      : 'approved';

    const { data: claimed, error: claimErr } = await supabase
      .from('tkg_actions')
      .update({
        status: targetStatus,
        ...(isReject ? { feedback_weight: -0.5 } : {}),
        ...(isReject && skipReason ? { skip_reason: skipReason } : {}),
      })
      .eq('id', actionId)
      .eq('user_id', userId)
      .eq('status', candidateStatus)
      .select('*')
      .maybeSingle();

    if (!claimErr && claimed) {
      claimedStatus = candidateStatus;
      action = claimed as Record<string, unknown>;
      break;
    }
  }

  if (!action || !claimedStatus) {
    return { status: 'skipped', action_id: actionId, error: 'Action already claimed by another request or not found' };
  }

  if (isReject) {
    const skipContent = skipReason
      ? `Skipped (${skipReason}): ${action.directive_text ?? ''}\nReason: ${action.reason ?? ''}`
      : `Skipped: ${action.directive_text ?? ''}\nReason: ${action.reason ?? ''}`;

    await insertFeedbackSignalIdempotent(supabase, userId, actionId, 'skip', skipContent);
    await suppressCommitmentsForSkippedAction(supabase, action);

    void updateMlSnapshotOutcome(supabase, {
      actionId,
      outcomeLabel: decision === 'reject' ? 'rejected' : 'skipped',
    });

    await reinforceAttentionForAction(supabase, userId, actionId, action, 'skipped');

    return { status: claimedStatus === 'draft' ? 'draft_rejected' : 'skipped', action_id: actionId };
  }

  const execResult = (action.execution_result as Record<string, unknown>) ?? {};
  const artifact = editedArtifact ?? resolveArtifact(action as Record<string, unknown>);
  let executionResult: Record<string, unknown> = { ...execResult };
  const now = new Date().toISOString();

  if (artifact) {
    const run = await executeArtifact(userId, artifact, actionId, supabase, {
      actionType: typeof action.action_type === 'string' ? action.action_type : undefined,
      directiveTitle: typeof action.directive_text === 'string' ? action.directive_text : null,
    });
    executionResult = { ...executionResult, ...run, artifact };
  } else {
    executionResult.exec_error = 'No artifact to execute';
    console.warn(`[execute-action] no artifact for action ${actionId}`);
  }

  // Audit trail: record when the user approved and who issued the decision.
  executionResult = { ...executionResult, approved_at: now, approved_by: 'user' };

  if (!artifact || !executionSucceeded(artifact, executionResult)) {
    const { error: updateError } = await supabase
      .from('tkg_actions')
      .update({
        status: action.action_type === 'send_message' ? 'failed' : action.status,
        approved_at: now,
        execution_result: executionResult,
        last_error:
          typeof executionResult.exec_error === 'string'
            ? executionResult.exec_error
            : typeof executionResult.send_error === 'string'
              ? executionResult.send_error
              : null,
      })
      .eq('id', actionId);
    if (updateError) {
      throw new Error(updateError.message);
    }

    void updateMlSnapshotOutcome(supabase, { actionId, outcomeLabel: 'failed' });

    await reinforceAttentionForAction(
      supabase,
      userId,
      actionId,
      { ...action, execution_result: executionResult },
      'failed',
    );

    throw new Error(
      typeof executionResult.exec_error === 'string'
        ? executionResult.exec_error
        : 'Execution did not complete',
    );
  }

  const { error: executionUpdateError } = await supabase
    .from('tkg_actions')
    .update({
      status: 'executed',
      approved_at: now,
      executed_at: now,
      execution_result: executionResult,
      feedback_weight: 1.0,
    })
    .eq('id', actionId);
  if (executionUpdateError) {
    throw new Error(executionUpdateError.message);
  }

  const approvalContent = `Approved: ${action.directive_text ?? ''}\nReason: ${action.reason ?? ''}`;
  await insertFeedbackSignalIdempotent(supabase, userId, actionId, 'approve', approvalContent);

  void updateMlSnapshotOutcome(supabase, { actionId, outcomeLabel: 'executed' });

  await reinforceAttentionForAction(
    supabase,
    userId,
    actionId,
    { ...action, execution_result: executionResult },
    'executed',
  );

  return {
    status: 'executed',
    action_id: actionId,
    action_type: typeof action.action_type === 'string' ? action.action_type : undefined,
    result: executionResult,
  };
}
