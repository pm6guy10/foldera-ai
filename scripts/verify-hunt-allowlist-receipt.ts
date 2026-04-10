/**
 * Bounded live read: rebuild hunt StructuredContext from DB signal + contaminated relationshipContext.
 * npm run verify:hunt-allowlist (optional package.json)
 *
 * Proves artifact.to could not be authorized from relationshipContext alone when the winning thread
 * has no eligible external peer (e.g. noreply-only).
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import {
  buildStructuredContext,
  collectHuntSendMessageToValidationIssues,
} from '../lib/briefing/generator';
import type { ScoredLoop } from '../lib/briefing/scorer';

config({ path: resolve(process.cwd(), '.env.local') });

const OWNER = (process.env.AUDIT_USER_ID || process.env.OWNER_USER_ID || 'e40b7cd8-4925-42f7-bc99-5022969f1d22').trim();
const HUNT_SIGNAL_ID = '08b906c3-3e54-4981-b541-1ad868bfd43e';
const CONTAMINATED_RC =
  'Synthetic <wfe-6921e4b356ccff5a5f336b22@outlier.ai> | vendor | outlier';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(JSON.stringify({ error: 'missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }));
    process.exit(1);
  }
  const db = createClient(url, key);

  const { data: sig, error } = await db
    .from('tkg_signals')
    .select('id,source,type,occurred_at,author')
    .eq('user_id', OWNER)
    .eq('id', HUNT_SIGNAL_ID)
    .maybeSingle();

  if (error || !sig) {
    console.error(
      JSON.stringify({
        error: error?.message ?? 'signal not found',
        winner_candidate_id: `hunt_unreplied_${HUNT_SIGNAL_ID}`,
      }),
    );
    process.exit(1);
  }

  const winner: ScoredLoop = {
    id: `hunt_unreplied_${HUNT_SIGNAL_ID}`,
    type: 'hunt',
    title: 'Live hunt allowlist receipt',
    content: 'Unreplied inbound (live receipt)',
    suggestedActionType: 'send_message',
    matchedGoal: null,
    score: 5,
    breakdown: {
      stakes: 1,
      urgency: 1,
      tractability: 1,
      freshness: 1,
      actionTypeRate: 0.5,
      entityPenalty: 0,
      final_score: 5,
    },
    relatedSignals: [],
    sourceSignals: [{ kind: 'signal', id: sig.id }],
    confidence_prior: 70,
    lifecycle: {
      state: 'active_now',
      horizon: 'now',
      actionability: 'actionable',
      reason: 'receipt',
    },
    relationshipContext: CONTAMINATED_RC,
  };

  const evidence = [
    {
      source: sig.source ?? 'gmail',
      date: sig.occurred_at ? new Date(sig.occurred_at as string).toISOString().slice(0, 10) : 'unknown',
      subject: null as string | null,
      snippet: '(live row)',
      author: (sig.author as string) ?? null,
      direction: 'received' as const,
      signal_id: sig.id as string,
    },
  ];

  const emptyGuard = { approvedRecently: [] as never[], skippedRecently: [] as never[] };
  const ctx = buildStructuredContext(
    winner,
    emptyGuard,
    OWNER,
    evidence,
    null,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  );

  const persistedBadTo = 'wfe-6921e4b356ccff5a5f336b22@outlier.ai';
  const issues = collectHuntSendMessageToValidationIssues(ctx, 'send_message', persistedBadTo);
  const allow = ctx.hunt_send_message_recipient_allowlist;
  const matched = allow.includes(persistedBadTo.toLowerCase());

  const out = {
    winner_candidate_id: winner.id,
    winner_action_type: winner.suggestedActionType,
    recipient_email: persistedBadTo,
    source_signal_thread_ids: [sig.id],
    grounded_hunt_allowlist: allow,
    artifact_to_matched_grounded_hunt_allowlist: matched,
    hunt_remained_send_message_eligible: ctx.has_real_recipient && allow.length > 0,
    validation_issues_for_persisted_to: issues,
    winning_signal_author: sig.author,
    exact_blocker_if_failing: matched
      ? 'artifact.to matched hunt allowlist without winning-thread grounding (regression)'
      : ctx.has_real_recipient
        ? 'hunt has_real_recipient true but contaminated recipient path expected empty peers on noreply thread'
        : null,
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});
