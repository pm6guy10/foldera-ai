// Evidence behind the quiet dashboard's "All clear" moment.
//
// SAFE_SILENCE is a success, but on the pull surface it used to render as literal
// absence — the user gets no closure ("did it even look?") and goes back to
// re-checking apps. This loads the proof from the latest completed pipeline_runs
// row (append-only observability, provable freshness via completed_at) so the
// quiet state can say "checked N open loops at <time> — nothing needs you" with
// real numbers. Display only: no gate is touched, nothing is delivered to Slack,
// and when the evidence is stale/absent/ambiguous we return null so the surface
// stays exactly as quiet as before — never fabricate an all-clear.
import type { createServerClient } from '@/lib/db/client';

export type AllClearEvidence = {
  /** candidates_evaluated from the latest safe_silence run — the surveyed field. */
  checked_count: number;
  /** completed_at of that run (ISO) — when the field was last surveyed. */
  completed_at: string;
};

const FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Returns evidence ONLY when the latest completed user_run ended in safe_silence,
 * actually evaluated candidates, and finished within the last 24h. If the latest
 * run seeded a winner (even one the user has since dismissed), "nothing needs you"
 * would be a lie — return null and keep the plain quiet state.
 */
export async function loadAllClearEvidence(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  nowIso: string = new Date().toISOString(),
): Promise<AllClearEvidence | null> {
  try {
    const { data, error } = await supabase
      .from('pipeline_runs')
      .select('outcome, completed_at, candidates_evaluated')
      .eq('user_id', userId)
      .eq('phase', 'user_run')
      .not('completed_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;

    if (data.outcome !== 'safe_silence') return null;

    const checkedCount =
      typeof data.candidates_evaluated === 'number' ? data.candidates_evaluated : 0;
    if (checkedCount < 1) return null;

    const completedAt = typeof data.completed_at === 'string' ? data.completed_at : null;
    if (!completedAt) return null;
    const ageMs = Date.parse(nowIso) - Date.parse(completedAt);
    if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > FRESHNESS_WINDOW_MS) return null;

    return { checked_count: checkedCount, completed_at: completedAt };
  } catch (error: unknown) {
    // Evidence is a bonus, never a blocker for the surface.
    console.warn('[all-clear] evidence load failed:', error);
    return null;
  }
}
