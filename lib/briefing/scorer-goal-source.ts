/**
 * Goal anchor source for the scorer (#567 paradigm swap).
 *
 * The scorer ranks candidates against a "goal model". Historically that model
 * was the stored `tkg_goals` table — which rotted to 82d-frozen job-hunting
 * goals + n-gram garbage and made the engine serve homework. A live head-to-head
 * (2026-06-29) proved that anchoring on the owner's STATED stable objective beats
 * the stored model on the same pool.
 *
 * This module is the single, reversible seam for that swap. It returns the SAME
 * `{ data }` shape the scorer's `tkg_goals` query returned, so every downstream
 * consumer (matchGoal, the goal-primacy gate, the goal-gap boost) is unchanged —
 * only the *source* of the goal rows differs.
 *
 * Default is 'database' (zero behavior change). Set FOLDERA_GOAL_SOURCE=stated to
 * activate the objective anchor (the live flip, after a smoke run confirms it).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type GoalSourceMode = 'database' | 'stated';

interface GoalRowShape {
  goal_text: string;
  priority: number;
  goal_category: string | null;
  source: string;
}

export interface GoalQueryResult {
  data: GoalRowShape[] | null;
}

export function resolveGoalSourceMode(): GoalSourceMode {
  return process.env.FOLDERA_GOAL_SOURCE?.trim().toLowerCase() === 'stated'
    ? 'stated'
    : 'database';
}

/**
 * The stated objective, expanded into matchable goal rows. The keyword set is
 * deliberate: the existing keyword matcher (`matchGoal`) needs real objective
 * terms so that objective-relevant candidates (e.g. "Pay Supabase invoice" —
 * the product's own infra) survive the goal-primacy gate and earn the gap boost,
 * while objective-irrelevant personal homework (e.g. "$346.61 at Fred Meyer")
 * matches nothing and is correctly dropped.
 */
export function statedObjectiveGoalRows(): GoalRowShape[] {
  return [
    {
      goal_text:
        'Ship Foldera and onboard the first paying customer — launch, demo, signup, onboard, revenue, paying user, pricing, sales',
      priority: 1,
      goal_category: 'growth',
      source: 'stated_objective',
    },
    {
      goal_text:
        'Keep Foldera shippable — protect its own infrastructure, uptime and billing (Supabase, Vercel, deploy, outage, error, invoice, infrastructure)',
      priority: 1,
      goal_category: 'growth',
      source: 'stated_objective',
    },
  ];
}

/**
 * Load the scorer's goal anchor. Drop-in replacement for the inline `tkg_goals`
 * query in `scoreOpenLoops` — returns the identical `{ data }` shape.
 */
export async function loadScorerGoals(
  supabase: SupabaseClient,
  userId: string,
): Promise<GoalQueryResult> {
  if (resolveGoalSourceMode() === 'stated') {
    return { data: statedObjectiveGoalRows() };
  }
  const res = await supabase
    .from('tkg_goals')
    .select('goal_text, priority, goal_category, source')
    .eq('user_id', userId)
    .eq('status', 'active')
    .eq('current_priority', true)
    .order('priority', { ascending: true })
    .limit(20);
  return { data: (res.data as GoalRowShape[] | null) ?? null };
}
