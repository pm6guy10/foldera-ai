import { describe, expect, it, vi } from 'vitest';
import { evaluateProactiveDelivery, proactiveWinnerKey } from '../proactive-delivery';
import { normalizeWorkdayPresenceState } from '../model';

const NOW = '2026-06-30T18:00:00.000Z';

const draftBackedWinnerState = normalizeWorkdayPresenceState({
  current_focus: 'Pay overdue Supabase invoice',
  next_move: 'Send the finance team the overdue Supabase invoice payment confirmation',
  why_it_matters: 'Foldera infra is at risk of suspension.',
  state_source: 'scored_winner',
  created_at: NOW,
  updated_at: NOW,
  draft: {
    action_type: 'write_document',
    title: 'Supabase invoice payment memo',
    preview: 'Confirming payment of the overdue Supabase invoice to restore good standing.',
    body: 'Confirming payment of the overdue Supabase invoice to restore good standing.',
  },
});

const winnerOnlyNoDraftState = normalizeWorkdayPresenceState({
  current_focus: 'Pay overdue Supabase invoice',
  next_move: 'Send the finance team the overdue Supabase invoice payment confirmation',
  why_it_matters: 'Foldera infra is at risk of suspension.',
  state_source: 'scored_winner',
  created_at: NOW,
  updated_at: NOW,
});

const staleDraftBackedWinnerState = normalizeWorkdayPresenceState({
  ...draftBackedWinnerState,
  // 3.5h before NOW — older than a single heartbeat tick, the way a seed call that gets
  // blocked (manual call-limit / safe_silence / generation_failed) leaves
  // workday_presence_state untouched from whenever it last successfully wrote.
  updated_at: '2026-06-30T14:30:00.000Z',
});

describe('evaluateProactiveDelivery (#567 Phase B)', () => {
  it('delivers a draft-backed scored_winner with no prior cursor', async () => {
    const postMessage = vi.fn().mockResolvedValue({
      ok: true,
      mode: 'live',
      channel: 'C123',
      message_ts: '1719234567.123456',
      response: {},
    });

    const result = await evaluateProactiveDelivery({
      rawState: draftBackedWinnerState,
      cursor: null,
      nowIso: NOW,
      channel: 'C123',
      slack: { postMessage },
      triggerRunnerLastPingedAt: null,
    });

    expect(result.delivered).toBe(true);
    expect(postMessage).toHaveBeenCalledTimes(1);
    if (result.delivered) {
      expect(result.cursor.last_winner_key).toBe(proactiveWinnerKey(draftBackedWinnerState!));
      expect(result.cursor.last_pinged_at).toBe(NOW);
    }
  });

  it('#394 finished-work gate: stays SAFE_SILENT for a scored_winner with no reviewable draft (never posts homework)', async () => {
    const postMessage = vi.fn();

    const result = await evaluateProactiveDelivery({
      rawState: winnerOnlyNoDraftState,
      cursor: null,
      nowIso: NOW,
      channel: 'C123',
      slack: { postMessage },
      triggerRunnerLastPingedAt: null,
    });

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe('payload_mode_silent');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('does not re-deliver the identical winner already pinged (dedup by content, not timestamp/row id)', async () => {
    const postMessage = vi.fn();
    const existingCursor = {
      last_winner_key: proactiveWinnerKey(draftBackedWinnerState!),
      last_pinged_at: '2026-06-30T11:00:00.000Z',
    };

    const result = await evaluateProactiveDelivery({
      rawState: draftBackedWinnerState,
      cursor: existingCursor,
      nowIso: NOW,
      channel: 'C123',
      slack: { postMessage },
      triggerRunnerLastPingedAt: null,
    });

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe('already_delivered_this_winner');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('REGRESSION (2026-06-30 live incident): never delivers stale leftover state this tick did not seed, even with no dedup history', async () => {
    // A seed call blocked by the daily manual-call-limit (or safe_silence / generation_failed
    // / bottom_gate) leaves workday_presence_state untouched -- still whatever a PRIOR,
    // possibly hours-old seed wrote. The first time this module ran in production it had no
    // cursor history and delivered a 3.5h-old pre-Phase-A homework card as if it were fresh.
    const postMessage = vi.fn();

    const result = await evaluateProactiveDelivery({
      rawState: staleDraftBackedWinnerState,
      cursor: null,
      nowIso: NOW,
      channel: 'C123',
      slack: { postMessage },
      triggerRunnerLastPingedAt: null,
    });

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe('state_not_freshly_seeded');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('delivers state seeded just inside the freshness window', async () => {
    const postMessage = vi.fn().mockResolvedValue({
      ok: true,
      mode: 'live',
      channel: 'C123',
      message_ts: '1719234567.111111',
      response: {},
    });
    const justFreshState = normalizeWorkdayPresenceState({
      ...draftBackedWinnerState,
      updated_at: '2026-06-30T17:51:00.000Z', // 9 minutes before NOW, inside the 10-minute window
    });

    const result = await evaluateProactiveDelivery({
      rawState: justFreshState,
      cursor: null,
      nowIso: NOW,
      channel: 'C123',
      slack: { postMessage },
      triggerRunnerLastPingedAt: null,
    });

    expect(result.delivered).toBe(true);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it('does not deliver state seeded just outside the freshness window', async () => {
    const postMessage = vi.fn();
    const justStaleState = normalizeWorkdayPresenceState({
      ...draftBackedWinnerState,
      updated_at: '2026-06-30T17:49:00.000Z', // 11 minutes before NOW, outside the 10-minute window
    });

    const result = await evaluateProactiveDelivery({
      rawState: justStaleState,
      cursor: null,
      nowIso: NOW,
      channel: 'C123',
      slack: { postMessage },
      triggerRunnerLastPingedAt: null,
    });

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe('state_not_freshly_seeded');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('delivers again when the winner content genuinely changed since the last cursor', async () => {
    const postMessage = vi.fn().mockResolvedValue({
      ok: true,
      mode: 'live',
      channel: 'C123',
      message_ts: '1719234567.654321',
      response: {},
    });
    const staleCursor = { last_winner_key: 'some-other-old-winner|write_document|Old title|', last_pinged_at: '2026-06-29T11:00:00.000Z' };

    const result = await evaluateProactiveDelivery({
      rawState: draftBackedWinnerState,
      cursor: staleCursor,
      nowIso: NOW,
      channel: 'C123',
      slack: { postMessage },
      triggerRunnerLastPingedAt: null,
    });

    expect(result.delivered).toBe(true);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it('never double-posts: stays quiet when trigger-runner already posted a reactive card moments ago in this tick', async () => {
    const postMessage = vi.fn();

    const result = await evaluateProactiveDelivery({
      rawState: draftBackedWinnerState,
      cursor: null,
      nowIso: NOW,
      channel: 'C123',
      slack: { postMessage },
      triggerRunnerLastPingedAt: '2026-06-30T17:58:00.000Z', // 2 minutes ago
    });

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe('reactive_trigger_already_posted_this_tick');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('delivers when trigger-runner last posted hours ago (a stale ping must not suppress today)', async () => {
    const postMessage = vi.fn().mockResolvedValue({
      ok: true,
      mode: 'live',
      channel: 'C123',
      message_ts: '1719234567.999999',
      response: {},
    });

    const result = await evaluateProactiveDelivery({
      rawState: draftBackedWinnerState,
      cursor: null,
      nowIso: NOW,
      channel: 'C123',
      slack: { postMessage },
      triggerRunnerLastPingedAt: '2026-06-29T11:49:00.000Z', // yesterday
    });

    expect(result.delivered).toBe(true);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when Slack is not configured (no channel / no adapter) instead of throwing', async () => {
    const result = await evaluateProactiveDelivery({
      rawState: draftBackedWinnerState,
      cursor: null,
      nowIso: NOW,
      channel: null,
      slack: null,
      triggerRunnerLastPingedAt: null,
    });

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe('slack_not_configured');
  });

  it('stays quiet when there is no state at all', async () => {
    const postMessage = vi.fn();

    const result = await evaluateProactiveDelivery({
      rawState: null,
      cursor: null,
      nowIso: NOW,
      channel: 'C123',
      slack: { postMessage },
      triggerRunnerLastPingedAt: null,
    });

    expect(result.delivered).toBe(false);
    expect(result.reason).toBe('no_state');
    expect(postMessage).not.toHaveBeenCalled();
  });
});

describe('proactiveWinnerKey', () => {
  it('is stable for identical move + draft content', () => {
    const a = proactiveWinnerKey(draftBackedWinnerState!);
    const b = proactiveWinnerKey(normalizeWorkdayPresenceState({
      ...draftBackedWinnerState,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    })!);
    expect(a).toBe(b);
  });

  it('differs when the draft title changes', () => {
    const a = proactiveWinnerKey(draftBackedWinnerState!);
    const b = proactiveWinnerKey(normalizeWorkdayPresenceState({
      ...draftBackedWinnerState,
      draft: { ...draftBackedWinnerState!.draft!, title: 'A different memo' },
    })!);
    expect(a).not.toBe(b);
  });
});
