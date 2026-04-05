/**
 * Persist coarse ML snapshots at directive creation; update outcomes on user action.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConvictionDirective } from '@/lib/briefing/types';
import {
  buildDirectiveMlBucketKey,
  featuresJsonFromInputs,
  mlBucketInputsFromWinnerLog,
  serializeTopCandidatesForMl,
} from '@/lib/ml/outcome-features';
import { fetchGlobalMlPriorMap } from '@/lib/ml/priors';

export async function insertDirectiveMlSnapshot(
  supabase: SupabaseClient,
  args: {
    userId: string;
    actionId: string;
    directive: ConvictionDirective;
  },
): Promise<void> {
  const inputs = mlBucketInputsFromWinnerLog(args.directive.generationLog?.candidateDiscovery ?? null);
  if (!inputs) return;

  const bucketKey = buildDirectiveMlBucketKey(inputs);
  const priors = await fetchGlobalMlPriorMap();
  const globalPriorSnapshot = priors.get(bucketKey) ?? null;

  const topCandidates = serializeTopCandidatesForMl(
    args.directive.generationLog?.candidateDiscovery?.topCandidates,
  );

  const { error } = await supabase.from('tkg_directive_ml_snapshots').insert({
    user_id: args.userId,
    action_id: args.actionId,
    bucket_key: bucketKey,
    features: featuresJsonFromInputs(inputs),
    top_candidates: topCandidates,
    outcome_label: 'pending',
    global_prior_snapshot: globalPriorSnapshot,
  });

  if (error && (error as { code?: string }).code !== '23505') {
    console.warn('[ml-snapshot] insert failed:', error.message);
  }
}

export type MlOutcomeLabel =
  | 'pending'
  | 'approved'
  | 'skipped'
  | 'rejected'
  | 'executed'
  | 'failed'
  | 'no_send_generated';

export async function updateMlSnapshotOutcome(
  supabase: SupabaseClient,
  args: { actionId: string; outcomeLabel: MlOutcomeLabel },
): Promise<void> {
  const { error } = await supabase
    .from('tkg_directive_ml_snapshots')
    .update({
      outcome_label: args.outcomeLabel,
      outcome_updated_at: new Date().toISOString(),
    })
    .eq('action_id', args.actionId);

  if (error) {
    console.warn('[ml-snapshot] outcome update failed:', error.message);
  }
}

export async function markMlSnapshotEmailEngagement(
  supabase: SupabaseClient,
  args: { actionId: string; opened?: boolean; clicked?: boolean },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (args.opened) patch.email_opened = true;
  if (args.clicked) patch.email_clicked = true;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from('tkg_directive_ml_snapshots').update(patch).eq('action_id', args.actionId);
  if (error) {
    console.warn('[ml-snapshot] engagement update failed:', error.message);
  }
}
