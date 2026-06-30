// On-demand delivery: seed → trigger, for one user, with NO cron and NO CRON_SECRET.
//
// This is the "trigger as needed" core. The vercel.json crons are only a throttled
// fallback heartbeat; the real product is event-driven — a fresh signal (provider push)
// should produce a card within seconds. Both the cron pipeline and the push webhook call
// this so they can never drift apart (the seed-gate bug existed precisely because those
// paths were hand-duplicated).
//
// Two trigger contexts, opposite gating:
//   - 'heartbeat' (throttled daily cron / explicit "sync now"): ALWAYS seed. We want to
//     evaluate the whole commitment pool for completeness — time-based lapsing commitments
//     have no inbound signal. Cheap because it runs at most a few times a day.
//   - 'push' (provider webhook, can fire many times an hour): seed only when the cheap
//     materiality gate says a real, actionable change arrived. This is the cost lever that
//     keeps LLM spend from scaling with raw inbound volume.
//
// trigger-runner then fires the Slack card iff a real move cleared the bar and the caller
// is the owner with Slack configured — otherwise it stays honestly quiet.
import { seedFromScorerForUser, type SeedOutcome } from '@/lib/workday-presence/seed-from-scorer-core';
import { isMaterialChange, type SyncDelta } from '@/lib/workday-presence/materiality-gate';
import {
  maybeRunWorkdayPresenceTriggerRunnerForUser,
  type MaybeTriggerRunnerResult,
} from '@/lib/workday-presence/trigger-runner';
import {
  maybeDeliverProactiveWinner,
  type MaybeProactiveDeliveryResult,
} from '@/lib/workday-presence/proactive-delivery';

export interface DeliverOptions {
  /** 'heartbeat' always seeds; 'push' gates the seed on the materiality of `syncDelta`. */
  trigger?: 'heartbeat' | 'push';
  /** Freshly-synced delta counts, required for the 'push' materiality gate. */
  syncDelta?: SyncDelta;
}

export interface DeliverNowResult {
  trigger_context: 'heartbeat' | 'push';
  seeded: boolean;
  /** Set when a 'push' was skipped before spending the brain. */
  skipped_reason?: string;
  seed: SeedOutcome | { error: string } | null;
  trigger: MaybeTriggerRunnerResult | { error: string } | null;
  /**
   * Proactive delivery (#567 Phase B) — only attempted on 'heartbeat'. A reactive
   * push-driven trigger already has its own delivery path (trigger); this is the
   * fallback that surfaces a heartbeat-seeded, draft-backed winner with no fresh
   * inbound signal of its own. null on 'push' context or when seeding didn't happen.
   */
  proactive: MaybeProactiveDeliveryResult | { error: string } | null;
}

export async function deliverWorkdayPresence(
  userId: string,
  options: DeliverOptions = {},
): Promise<DeliverNowResult> {
  const context = options.trigger ?? 'heartbeat';

  // Push cost gate: skip the brain (and the trigger) when nothing actionable arrived.
  // Heartbeat bypasses this on purpose — see file header.
  if (context === 'push') {
    const delta = options.syncDelta ?? { gmail: 0, calendar: 0, drive: 0 };
    const verdict = isMaterialChange(delta);
    if (!verdict.material) {
      return {
        trigger_context: context,
        seeded: false,
        skipped_reason: verdict.reason,
        seed: null,
        trigger: null,
        proactive: null,
      };
    }
  }

  let seed: SeedOutcome | { error: string };
  try {
    seed = await seedFromScorerForUser(userId);
  } catch (err: unknown) {
    // Seed failures are already self-traced (suppression_trace). Don't block the
    // trigger-runner — it has time-based triggers (commitment lapsing) that can fire
    // off existing state even if this seed attempt threw.
    seed = { error: err instanceof Error ? err.message : String(err) };
  }

  let trigger: MaybeTriggerRunnerResult | { error: string };
  try {
    trigger = await maybeRunWorkdayPresenceTriggerRunnerForUser(userId);
  } catch (err: unknown) {
    trigger = { error: err instanceof Error ? err.message : String(err) };
  }

  // Proactive fallback (#567 Phase B) — heartbeat only. A 'push' tick already has its
  // own reason to interrupt (the fresh signal trigger-runner just evaluated); proactive
  // delivery exists specifically for the heartbeat case where the brain found a real,
  // draft-backed winner with no fresh inbound signal of its own to ride.
  let proactive: MaybeProactiveDeliveryResult | { error: string } | null = null;
  if (context === 'heartbeat') {
    try {
      proactive = await maybeDeliverProactiveWinner(userId);
    } catch (err: unknown) {
      proactive = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  return {
    trigger_context: context,
    seeded: 'seeded' in seed ? seed.seeded : false,
    seed,
    trigger,
    proactive,
  };
}
