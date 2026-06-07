import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/db/client';
import {
  buildSlackRightNowMessage,
  parseSlackInteractionAction,
  resolveSlackAdapterFromEnv,
  verifySlackRequestSignature,
  type SlackInteractionPayload,
} from '@/lib/slack/right-now';
import { redactSlackSecret } from '@/lib/slack/redaction';
import {
  applyInteractionHistoryToState,
  appendWorkdayPresenceInteractionHistory,
} from '@/lib/workday-presence/actions';
import { buildRightNowMessagePayload, type RightNowMessageActionId } from '@/lib/workday-presence/message';
import { normalizeWorkdayPresenceState, type WorkdayPresenceState } from '@/lib/workday-presence/model';
import { buildPresenceLoopReceipt } from '@/lib/workday-presence/presence-loop-receipt';
import { apiErrorForRoute, badRequest } from '@/lib/utils/api-error';

export const dynamic = 'force-dynamic';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function persistState(
  userId: string,
  metadata: Record<string, unknown>,
  nextState: WorkdayPresenceState,
  actionId: RightNowMessageActionId,
): Promise<WorkdayPresenceState> {
  const stateWithHistory = applyInteractionHistoryToState(
    metadata,
    actionId,
    nextState,
    nextState.updated_at,
  );
  const supabase = createServerClient();
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

    const interaction = parseSlackInteractionAction(payload);
    if (!interaction) return badRequest('Invalid Slack action');

    const supabase = createServerClient();
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error) throw error;
    const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const currentState = normalizeWorkdayPresenceState(metadata.workday_presence_state);
    if (!currentState) return badRequest('No active workday presence state');

    const nowIso = new Date().toISOString();
    const receipt = buildPresenceLoopReceipt(currentState, {
      action_id: interaction.actionId,
      blocker: interaction.blocker,
      nowIso,
    });
    const persistedState = await persistState(userId, metadata, receipt.after_state, interaction.actionId);
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
