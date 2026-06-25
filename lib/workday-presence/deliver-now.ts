// On-demand delivery: seed → trigger, for one user, with NO cron and NO CRON_SECRET.
//
// This is the "trigger as needed" core. The vercel.json crons are only a throttled
// fallback heartbeat; the real product is event-driven — a fresh signal or an explicit
// "sync now" should produce a card within seconds. Both the cron pipeline and the
// session-authed sync-now routes call this so they can never drift apart again
// (the seed-gate bug existed precisely because those paths were hand-duplicated).
//
// seedFromScorerForUser always runs (the scorer draws from the commitment pool, not
// signals, so it always has candidates; safe-silence + suppression_trace prevent noise).
// trigger-runner then fires the Slack card iff a real move cleared the bar and the caller
// is the owner with Slack configured — otherwise it stays honestly quiet.
import { seedFromScorerForUser, type SeedOutcome } from '@/lib/workday-presence/seed-from-scorer-core';
import {
  maybeRunWorkdayPresenceTriggerRunnerForUser,
  type MaybeTriggerRunnerResult,
} from '@/lib/workday-presence/trigger-runner';

export interface DeliverNowResult {
  seed: SeedOutcome | { error: string };
  trigger: MaybeTriggerRunnerResult | { error: string };
}

export async function deliverWorkdayPresence(userId: string): Promise<DeliverNowResult> {
  let seed: DeliverNowResult['seed'];
  try {
    seed = await seedFromScorerForUser(userId);
  } catch (err: unknown) {
    // Seed failures are already self-traced (suppression_trace). Don't block the
    // trigger-runner — it has time-based triggers (commitment lapsing) that can fire
    // off existing state even if this seed attempt threw.
    seed = { error: err instanceof Error ? err.message : String(err) };
  }

  let trigger: DeliverNowResult['trigger'];
  try {
    trigger = await maybeRunWorkdayPresenceTriggerRunnerForUser(userId);
  } catch (err: unknown) {
    trigger = { error: err instanceof Error ? err.message : String(err) };
  }

  return { seed, trigger };
}
