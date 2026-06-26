import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/client';
import {
  buildReviewSendModal,
  buildSlackRightNowMessage,
  parseSlackInteractionAction,
  parseSlackReviewSendAction,
  parseSlackReviewSendSubmission,
  resolveSlackAdapterFromEnv,
  verifySlackRequestSignature,
  type ReviewSendModalMetadata,
  type SlackInteractionPayload,
} from '@/lib/slack/right-now';
import { redactSlackSecret } from '@/lib/slack/redaction';
import {
  applyInteractionHistoryToState,
  appendWorkdayPresenceInteractionHistory,
  applyWorkdayPresenceAction,
} from '@/lib/workday-presence/actions';
import { buildRightNowMessagePayload, type RightNowMessageActionId } from '@/lib/workday-presence/message';
import {
  buildRightNowCard,
  normalizeWorkdayPresenceState,
  type WorkdayPresenceState,
} from '@/lib/workday-presence/model';
import { normalizeWorkdayPresenceTriggerRunnerCursor } from '@/lib/workday-presence/trigger-runner';
import { insertPresenceReceipt } from '@/lib/workday-presence/presence-action-receipt';
import { buildPresenceLoopReceipt } from '@/lib/workday-presence/presence-loop-receipt';
import { executeAction } from '@/lib/conviction/execute-action';
import { apiErrorForRoute, badRequest } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function persistStateAndReceipt(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  metadata: Record<string, unknown>,
  nextState: WorkdayPresenceState,
  actionId: RightNowMessageActionId,
  respondedToSlackTs?: string | null,
): Promise<WorkdayPresenceState> {
  const stateWithHistory = applyInteractionHistoryToState(
    metadata,
    actionId,
    nextState,
    nextState.updated_at,
  );
  await insertPresenceReceipt(supabase, userId, actionId, stateWithHistory, respondedToSlackTs);
  const nextMetadata = appendWorkdayPresenceInteractionHistory(
    metadata,
    actionId,
    stateWithHistory,
    nextState.updated_at,
  );
  const updateResult = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: nextMetadata,
  });
  if (updateResult.error) throw updateResult.error;
  return stateWithHistory;
}

async function handleHiddenOpOutcome(
  userId: string,
  metadata: Record<string, unknown>,
  nowIso: string,
): Promise<{ acknowledged: true; hidden_op_signal_id: string | null; outcome_logged: boolean } | null> {
  const cursor = normalizeWorkdayPresenceTriggerRunnerCursor(
    metadata.workday_presence_trigger_runner,
  );
  const lastTriggerKey = cursor.last_trigger_key ?? '';
  if (!lastTriggerKey.startsWith('hidden_op:')) return null;

  const signalId = lastTriggerKey.slice(10);
  const supabase = createServerClient();
  const { error } = await supabase
    .from('tkg_signals')
    .update({
      outcome_label: 'CONFIRMED_WORKED',
      updated_at: nowIso,
    })
    .eq('id', signalId)
    .eq('user_id', userId);

  if (error) throw error;
  return {
    acknowledged: true,
    hidden_op_signal_id: signalId,
    outcome_logged: true,
  };
}

function requireSlackInteractionConfig() {
  const signingSecret = process.env.SLACK_SIGNING_SECRET?.trim();
  const userId = process.env.FOLDERA_SELF_USER_ID?.trim();
  if (!signingSecret) throw new Error('Missing SLACK_SIGNING_SECRET for Slack interaction verification');
  if (!userId) throw new Error('Missing FOLDERA_SELF_USER_ID for Brandon-only Slack state updates');
  return { signingSecret, userId };
}

function validateSupabaseAuthUserId(userId: string): true | NextResponse {
  if (UUID_PATTERN.test(userId)) return true;
  return badRequest('Invalid FOLDERA_SELF_USER_ID: expected Supabase auth user UUID');
}

async function parseSlackBody(request: Request): Promise<{ rawBody: string; payload: SlackInteractionPayload | null }> {
  const rawBody = await request.text();
  const form = new URLSearchParams(rawBody);
  const rawPayload = form.get('payload');
  if (!rawPayload) return { rawBody, payload: null };
  return { rawBody, payload: JSON.parse(rawPayload) as SlackInteractionPayload };
}

/**
 * Resolve the artifact to send: prefer the stored row artifact (carries thread headers
 * like gmail_thread_id and the finished-work attachments so they ride with the send),
 * then overlay the reviewed subject/body the user signed off on. The attachments stay
 * server-side through `...stored` — the modal never re-sends file bytes. Returns the
 * edited artifact passed to executeAction, or null if the row has no usable artifact.
 */
async function buildEditedSendArtifact(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  actionId: string,
  subject: string,
  body: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('tkg_actions')
    .select('artifact, execution_result')
    .eq('id', actionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const execResult = (data.execution_result as Record<string, unknown> | null) ?? {};
  const stored =
    (execResult.artifact as Record<string, unknown> | undefined) ??
    (data.artifact as Record<string, unknown> | null) ??
    null;
  if (!stored || typeof stored !== 'object') return null;

  const to = typeof stored.to === 'string' ? stored.to : typeof stored.recipient === 'string' ? stored.recipient : '';
  if (!to) return null;

  return {
    ...stored,
    type: 'email',
    to,
    subject: subject || (typeof stored.subject === 'string' ? stored.subject : ''),
    body: body || (typeof stored.body === 'string' ? stored.body : ''),
  };
}

/**
 * The review-gated send sign-off. Runs ONLY from an explicit modal submission. Executes the
 * real send via the shared executeAction layer (user's own Gmail), records the move as done,
 * and updates the original ping in place. Live send stays behind ALLOW_APPROVAL_EMAIL_SEND;
 * when it is off the row is still approved but the message says so honestly.
 */
async function handleReviewSendSubmission(
  userId: string,
  submission: NonNullable<ReturnType<typeof parseSlackReviewSendSubmission>>,
): Promise<NextResponse> {
  const supabase = createServerClient();
  const { metadata: modalMeta, subject, body } = submission;

  const editedArtifact = await buildEditedSendArtifact(
    supabase,
    userId,
    modalMeta.action_id,
    subject,
    body,
  );

  let sentLine: string;
  try {
    const result = await executeAction({
      userId,
      actionId: modalMeta.action_id,
      decision: 'approve',
      ...(editedArtifact ? { editedArtifact } : {}),
    });
    const execResult = (result.result ?? {}) as Record<string, unknown>;
    const to = typeof editedArtifact?.to === 'string' ? editedArtifact.to : 'the recipient';
    const attachmentCount =
      typeof execResult.attachment_count === 'number' ? execResult.attachment_count : 0;
    const withAttachments =
      attachmentCount > 0
        ? ` with ${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}`
        : '';
    if (result.status !== 'executed') {
      sentLine = `:warning: Could not send — ${result.error ?? 'action was not actionable'}.`;
    } else if (execResult.email_send_disabled === true) {
      sentLine = `:white_check_mark: Reviewed & approved. Live send is armed *off* — set \`ALLOW_APPROVAL_EMAIL_SEND=true\` to actually send to ${to}.`;
    } else if (execResult.sent === true) {
      const via = typeof execResult.sent_via === 'string' ? execResult.sent_via : 'your mailbox';
      sentLine = `:white_check_mark: Sent to ${to} from ${via}${withAttachments}.`;
    } else {
      sentLine = `:white_check_mark: Approved — sending to ${to}.`;
    }
  } catch (sendError: unknown) {
    const message = sendError instanceof Error ? sendError.message : String(sendError);
    sentLine = `:warning: Send failed — ${message}. The move is still here; nothing was sent.`;
  }

  // Record the move as done (clears the draft, writes a presence receipt) so the loop is
  // auditable and the card reflects completion. Best-effort — never fail the Slack response.
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    const liveMetadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const done = applyWorkdayPresenceAction(liveMetadata.workday_presence_state, 'done');
    if (done.ok) {
      await persistStateAndReceipt(supabase, userId, liveMetadata, done.nextState, 'done', modalMeta.message_ts);
    }
  } catch (doneError: unknown) {
    console.warn('[slack interaction] post-send done failed:', doneError);
  }

  // Update the original ping in place with the outcome.
  if (modalMeta.channel && modalMeta.message_ts) {
    try {
      await resolveSlackAdapterFromEnv().updateMessage({
        channel: modalMeta.channel,
        text: sentLine,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: sentLine } }],
        ts: modalMeta.message_ts,
      });
    } catch (updateError: unknown) {
      console.warn('[slack interaction] message update after send failed:', updateError);
    }
  }

  // Empty 200 closes the modal.
  return NextResponse.json({});
}

export async function POST(request: Request) {
  try {
    const { signingSecret, userId } = requireSlackInteractionConfig();
    const { rawBody, payload } = await parseSlackBody(request);
    if (!payload) return badRequest('Slack interaction payload is required');
    const validUserId = validateSupabaseAuthUserId(userId);
    if (validUserId !== true) return validUserId;

    const signatureOk = verifySlackRequestSignature({
      signingSecret,
      timestamp: request.headers.get('x-slack-request-timestamp'),
      signature: request.headers.get('x-slack-signature'),
      rawBody,
    });
    if (!signatureOk) return NextResponse.json({ error: 'Invalid Slack signature' }, { status: 401 });

    // Modal sign-off: the only path that executes a real send.
    const submission = parseSlackReviewSendSubmission(payload);
    if (submission) {
      return await handleReviewSendSubmission(userId, submission);
    }

    const supabase = createServerClient();
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error) throw error;
    const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const currentState = normalizeWorkdayPresenceState(metadata.workday_presence_state);

    // Review-send button: open the deliberate review modal. Nothing sends here.
    const reviewSend = parseSlackReviewSendAction(payload);
    if (reviewSend) {
      const draft = currentState?.draft;
      if (!draft?.action_id) {
        return badRequest('No sendable draft to review');
      }
      const card = buildRightNowCard(currentState);
      const sourceLine = card.mode === 'active' ? card.source_line : null;
      const modalMeta: ReviewSendModalMetadata = {
        action_id: draft.action_id,
        channel: reviewSend.channel,
        message_ts: reviewSend.messageTs,
      };
      const openResult = await resolveSlackAdapterFromEnv().openView(
        reviewSend.triggerId,
        buildReviewSendModal({ draft, sourceLine, metadata: modalMeta }),
      );
      return NextResponse.json(redactSlackSecret({ acknowledged: true, view_opened: openResult }));
    }

    const interaction = parseSlackInteractionAction(payload);
    if (!interaction) return badRequest('Invalid Slack action');

    const nowIso = new Date().toISOString();
    if (!currentState) {
      const hiddenOpOutcome = await handleHiddenOpOutcome(userId, metadata, nowIso);
      if (hiddenOpOutcome) {
        return NextResponse.json(redactSlackSecret(hiddenOpOutcome));
      }
      return badRequest('No active workday presence state and no hidden-op signal to acknowledge');
    }

    const receipt = buildPresenceLoopReceipt(currentState, {
      action_id: interaction.actionId,
      blocker: interaction.blocker,
      nowIso,
    });
    const persistedState = await persistStateAndReceipt(supabase, userId, metadata, receipt.after_state, interaction.actionId, interaction.messageTs);
    const nextPayload = buildRightNowMessagePayload(persistedState);

    let updateResult = null;
    if (interaction.channel && interaction.messageTs) {
      updateResult = await resolveSlackAdapterFromEnv().updateMessage({
        ...buildSlackRightNowMessage(nextPayload, interaction.channel),
        ts: interaction.messageTs,
      });
    }

    return NextResponse.json(
      redactSlackSecret({
        acknowledged: true,
        action_id: interaction.actionId,
        state: persistedState,
        payload: nextPayload,
        slack_update: updateResult,
        receipt: {
          ...receipt,
          after_state: persistedState,
          slack_update: updateResult,
        },
      }),
    );
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'slack interaction POST');
  }
}
