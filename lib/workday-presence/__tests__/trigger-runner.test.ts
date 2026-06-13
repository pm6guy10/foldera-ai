import { describe, expect, it, vi } from 'vitest';
import { normalizeWorkdayPresenceState } from '../model';
import { runWorkdayPresenceTriggerRunner } from '../trigger-runner';

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
});
