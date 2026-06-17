import { describe, expect, it, vi } from 'vitest';
import { normalizeWorkdayPresenceState } from '../model';
import {
  checkFreshSignalTriggerOverride,
  runWorkdayPresenceTriggerRunner,
} from '../trigger-runner';

describe('runWorkdayPresenceTriggerRunner', () => {
  const baseState = normalizeWorkdayPresenceState({
    current_focus: 'Close ACME renewal decision',
    next_move: 'Send owner confirmation note',
    why_it_matters: 'The renewal window closes at 4 PM PT.',
    waiting_on: 'thread-123',
    state_source: 'manual_anchor',
    created_at: '2026-06-12T15:00:00.000Z',
    updated_at: '2026-06-12T15:05:00.000Z',
  });

  it('posts one live Slack ping when a fresh reply-needed signal triggers an intervention', async () => {
    const postMessage = vi.fn().mockResolvedValue({
      ok: true,
      mode: 'live',
      channel: 'C123',
      message_ts: '1718200000.123',
      response: { ok: true },
    });

    const result = await runWorkdayPresenceTriggerRunner({
      channel: 'C123',
      state: baseState,
      cursor: null,
      nowIso: '2026-06-12T16:00:00.000Z',
      signals: [
        {
          id: 'sig-1',
          source: 'gmail',
          type: 'reply_needed',
          thread_id: 'thread-123',
          redacted_summary: 'Customer asked for a human-confirmed renewal answer.',
          reply_needed: true,
          ingested_at: '2026-06-12T15:59:00.000Z',
        },
      ],
      slack: { postMessage },
    });

    expect(result.outcome).toBe('intervention');
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(result.cursor.last_trigger_key).toContain('mention_reply_needed');
    expect(result.cursor.last_signal_cursor).toBe('2026-06-12T15:59:00.000Z');
  });

  it('persists the triggered state behind the live intervention so follow-up clicks are not acting on stale state', async () => {
    const postMessage = vi.fn().mockResolvedValue({
      ok: true,
      mode: 'live',
      channel: 'C123',
      message_ts: '1718200000.123',
      response: { ok: true },
    });
    const persistIntervention = vi.fn().mockResolvedValue(undefined);

    const result = await runWorkdayPresenceTriggerRunner({
      channel: 'C123',
      state: baseState,
      cursor: null,
      nowIso: '2026-06-12T16:00:00.000Z',
      signals: [
        {
          id: 'sig-1',
          source: 'gmail',
          type: 'reply_needed',
          thread_id: 'thread-123',
          redacted_summary: 'Customer asked for a human-confirmed renewal answer.',
          reply_needed: true,
          ingested_at: '2026-06-12T15:59:00.000Z',
        },
      ],
      slack: { postMessage },
      persistIntervention,
    });

    expect(result.outcome).toBe('intervention');
    expect(persistIntervention).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger_type: 'mention_reply_needed',
        next_state: expect.objectContaining({
          next_move: expect.stringContaining('Reply needed'),
        }),
      }),
    );
  });

  it('stays quiet and posts nothing when fresh signals do not cross the intervention bar', async () => {
    const postMessage = vi.fn();

    const result = await runWorkdayPresenceTriggerRunner({
      channel: 'C123',
      state: baseState,
      cursor: null,
      nowIso: '2026-06-12T16:00:00.000Z',
      signals: [
        {
          id: 'sig-quiet',
          source: 'gmail',
          type: 'reply_needed',
          thread_id: 'thread-999',
          redacted_summary: 'Another thread moved, but it is not the active waiting-on loop.',
          reply_needed: true,
          ingested_at: '2026-06-12T15:59:00.000Z',
        },
      ],
      slack: { postMessage },
    });

    expect(result.outcome).toBe('quiet');
    expect(postMessage).not.toHaveBeenCalled();
    expect(result.cursor.last_trigger_key).toBeNull();
  });

  it('fires a hidden-op Slack ping when a buried high-consequence signal is found and normal path is quiet', async () => {
    const postMessage = vi.fn().mockResolvedValue({
      ok: true,
      mode: 'live',
      channel: 'C123',
      message_ts: '1718200000.456',
      response: { ok: true },
    });

    const result = await runWorkdayPresenceTriggerRunner({
      channel: 'C123',
      state: null, // no workday state — hidden-op fires without it
      cursor: null,
      nowIso: '2026-06-16T10:00:00.000Z',
      signals: [
        {
          id: 'sig-firstday',
          source: 'outlook_calendar',
          type: 'calendar_event',
          title: 'First day of work at CWU',
          starts_at_iso: '2026-06-19T08:00:00.000Z',
          ingested_at: '2026-06-15T09:00:00.000Z',
        },
      ],
      slack: { postMessage },
    });

    expect(result.outcome).toBe('intervention');
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(result.reason).toContain('hidden_op');
    expect(result.cursor.last_trigger_key).toMatch(/^hidden_op:/);
  });

  it('suppresses a hidden-op ping when the same signal was already surfaced this cursor window', async () => {
    const postMessage = vi.fn();

    const result = await runWorkdayPresenceTriggerRunner({
      channel: 'C123',
      state: null,
      cursor: {
        last_signal_cursor: '2026-06-15T09:00:00.000Z',
        last_trigger_key: 'hidden_op:sig-firstday',
        last_pinged_at: '2026-06-16T10:00:00.000Z',
        last_run_at: '2026-06-16T10:00:00.000Z',
      },
      nowIso: '2026-06-16T10:05:00.000Z',
      signals: [
        {
          id: 'sig-firstday',
          source: 'outlook_calendar',
          type: 'calendar_event',
          title: 'First day of work at CWU',
          starts_at_iso: '2026-06-19T08:00:00.000Z',
          ingested_at: '2026-06-15T09:00:00.000Z',
        },
      ],
      slack: { postMessage },
    });

    expect(result.outcome).toBe('quiet');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('suppresses an unchanged trigger so the next run does not re-ping', async () => {
    const postMessage = vi.fn();

    const result = await runWorkdayPresenceTriggerRunner({
      channel: 'C123',
      state: baseState,
      cursor: {
        last_signal_cursor: '2026-06-12T15:59:00.000Z',
        last_trigger_key:
          'mention_reply_needed|thread-123|Customer asked for a human-confirmed renewal answer.|2026-06-12T15:05:00.000Z',
        last_pinged_at: '2026-06-12T16:00:00.000Z',
        last_run_at: '2026-06-12T16:00:00.000Z',
      },
      nowIso: '2026-06-12T16:05:00.000Z',
      signals: [
        {
          id: 'sig-1',
          source: 'gmail',
          type: 'reply_needed',
          thread_id: 'thread-123',
          redacted_summary: 'Customer asked for a human-confirmed renewal answer.',
          reply_needed: true,
          ingested_at: '2026-06-12T15:59:00.000Z',
        },
      ],
      slack: { postMessage },
    });

    expect(result.outcome).toBe('dedup_suppressed');
    expect(postMessage).not.toHaveBeenCalled();
    expect(result.cursor.last_trigger_key).toContain('mention_reply_needed');
    expect(result.cursor.last_signal_cursor).toBe('2026-06-12T15:59:00.000Z');
  });

  it('calls persistIntervention BEFORE slack.postMessage and blocks sending if persist fails', async () => {
    const postMessage = vi.fn().mockResolvedValue({
      ok: true,
      mode: 'live',
      channel: 'C123',
      message_ts: '1718200000.123',
      response: { ok: true },
    });
    const persistIntervention = vi.fn().mockRejectedValue(new Error('DB write failed'));

    await expect(
      runWorkdayPresenceTriggerRunner({
        channel: 'C123',
        state: baseState,
        cursor: null,
        nowIso: '2026-06-12T16:00:00.000Z',
        signals: [
          {
            id: 'sig-1',
            source: 'gmail',
            type: 'reply_needed',
            thread_id: 'thread-123',
            redacted_summary: 'Customer asked for a human-confirmed renewal answer.',
            reply_needed: true,
            ingested_at: '2026-06-12T15:59:00.000Z',
          },
        ],
        slack: { postMessage },
        persistIntervention,
      })
    ).rejects.toThrow('DB write failed');

    expect(persistIntervention).toHaveBeenCalledTimes(1);
    expect(postMessage).not.toHaveBeenCalled();
  });
});

describe('real ingested calendar signals fire pre_meeting (no flags, encrypted content)', () => {
  const state = normalizeWorkdayPresenceState({
    current_focus: 'Ship the Q3 plan',
    next_move: 'Draft the exec summary',
    why_it_matters: 'Board reviews it Friday.',
    state_source: 'manual_anchor',
    created_at: '2026-06-12T15:00:00.000Z',
    updated_at: '2026-06-12T15:05:00.000Z',
  });

  // Mirrors lib/sync/google-sync.ts real ingestion: source 'google_calendar',
  // type 'calendar_event', occurred_at = event start, content encrypted, and
  // NO starts_at_iso / title / requires_prep columns.
  function realCalendarSignal(occurredAt: string) {
    return {
      id: `cal-${occurredAt}`,
      source: 'google_calendar',
      type: 'calendar_event',
      author: 'organizer@example.com',
      content: 'ENC:opaque-ciphertext',
      occurred_at: occurredAt,
      ingested_at: '2026-06-12T15:59:00.000Z',
      processed: false,
    };
  }

  it('fires pre_meeting when a freshly-synced meeting is imminent', () => {
    const override = checkFreshSignalTriggerOverride({
      state,
      nowIso: '2026-06-12T16:00:00.000Z',
      signals: [realCalendarSignal('2026-06-12T17:00:00.000Z')], // 60 min out
    });
    expect(override).not.toBeNull();
    expect(override?.next_move).toContain('Prep for');
  });

  it('stays silent when the synced meeting is days away (not imminent)', () => {
    const override = checkFreshSignalTriggerOverride({
      state,
      nowIso: '2026-06-12T16:00:00.000Z',
      signals: [realCalendarSignal('2026-06-18T17:00:00.000Z')], // 6 days out
    });
    expect(override).toBeNull();
  });

  it('respects an explicit requires_prep=false flag so fixtures are unchanged', () => {
    const override = checkFreshSignalTriggerOverride({
      state,
      nowIso: '2026-06-12T16:00:00.000Z',
      signals: [
        {
          id: 'cal-fixture',
          source: 'calendar',
          type: 'calendar_event',
          title: 'Imminent fixture meeting',
          starts_at_iso: '2026-06-12T17:00:00.000Z',
          requires_prep: false,
          ingested_at: '2026-06-12T15:59:00.000Z',
        },
      ],
    });
    expect(override).toBeNull();
  });

  it('drives a full intervention + Slack ping end to end from a real calendar signal', async () => {
    const postMessage = vi.fn().mockResolvedValue({
      ok: true,
      mode: 'live',
      channel: 'C123',
      message_ts: 't',
      response: { ok: true },
    });
    const result = await runWorkdayPresenceTriggerRunner({
      channel: 'C123',
      state,
      cursor: null,
      nowIso: '2026-06-12T16:00:00.000Z',
      signals: [realCalendarSignal('2026-06-12T17:00:00.000Z')],
      slack: { postMessage },
    });
    expect(result.outcome).toBe('intervention');
    expect(result.selected_context?.trigger_type).toBe('pre_meeting');
    expect(postMessage).toHaveBeenCalledTimes(1);
  });
});
