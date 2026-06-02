import { describe, expect, it } from 'vitest';
import { applyWorkdayPresenceAction } from '../actions';
import { buildRightNowMessagePayload } from '../message';
import { selectSourceBackedRightNowState } from '../source-backed-state';

const nowIso = '2026-06-02T20:00:00.000Z';

describe('source-backed Right Now state selector', () => {
  it('selects one source-backed state from tkg_signals-shaped rows', () => {
    const state = selectSourceBackedRightNowState({
      nowIso,
      signals: [
        {
          id: 'sig_gmail_1',
          source: 'gmail',
          type: 'reply_needed',
          source_id: 'gmail-thread-123',
          occurred_at: '2026-06-02T19:40:00.000Z',
          redacted_summary: 'Customer is waiting for a human-confirmed renewal answer.',
          content: 'RAW PRIVATE EMAIL BODY MUST NOT APPEAR',
        },
        {
          id: 'sig_calendar_1',
          source: 'calendar',
          type: 'meeting_followup',
          occurred_at: '2026-06-02T18:00:00.000Z',
          redacted_summary: 'Calendar follow-up exists but is older.',
        },
      ],
      actions: [
        {
          id: 'act_1',
          source: 'foldera',
          action_type: 'draft_review',
          generated_at: '2026-06-02T19:45:00.000Z',
          evidence: {
            redacted_summary: 'Existing draft evidence says renewal answer needs review.',
          },
        },
      ],
    });

    expect(state).not.toBeNull();
    expect(state?.state_source).toBe('source_backed');
    expect(state?.source_trail).toHaveLength(2);
    expect(state?.source_trail[0]).toMatchObject({
      table: 'tkg_signals',
      source: 'gmail',
      type: 'reply_needed',
      source_id: 'gmail-thread-123',
      redacted_summary: 'Customer is waiting for a human-confirmed renewal answer.',
    });
    expect(state?.source_trail[1]).toMatchObject({
      table: 'tkg_actions',
      redacted_summary: 'Existing draft evidence says renewal answer needs review.',
    });
    expect(JSON.stringify(state)).not.toContain('RAW PRIVATE EMAIL BODY');
  });

  it('prefers an active tkg_commitments-shaped row as the one intervention', () => {
    const state = selectSourceBackedRightNowState({
      nowIso,
      signals: [
        {
          id: 'sig_drive_1',
          source: 'drive',
          type: 'document_update',
          occurred_at: '2026-06-02T19:50:00.000Z',
          redacted_summary: 'Drive doc changed.',
        },
      ],
      commitments: [
        {
          id: 'commitment_1',
          source: 'gmail',
          type: 'promise',
          status: 'open',
          due_at: '2026-06-02T22:00:00.000Z',
          owner_name: 'Renewal owner',
          project: 'Close ACME renewal',
          commitment_text: 'Confirm renewal owner decision before end of day.',
          content: 'RAW PRIVATE COMMITMENT CONTEXT MUST NOT APPEAR',
        },
      ],
    });

    expect(state?.source_trail).toHaveLength(1);
    expect(state?.source_trail[0]).toMatchObject({
      table: 'tkg_commitments',
      row_id: 'commitment_1',
      redacted_summary: 'Confirm renewal owner decision before end of day.',
    });
    expect(state?.current_focus).toBe('Close ACME renewal');
    expect(state?.waiting_on).toBe('Waiting on Renewal owner');
    expect(JSON.stringify(state)).not.toContain('RAW PRIVATE COMMITMENT CONTEXT');
  });

  it('returns quiet when no safe source-backed move exists', () => {
    const state = selectSourceBackedRightNowState({
      nowIso,
      signals: [{ id: 'sig_unsafe_1', source: 'gmail', type: 'reply_needed', content: 'raw only' }],
      commitments: [{ id: 'commitment_done_1', status: 'completed', redacted_summary: 'Already done.' }],
    });

    expect(state).toBeNull();
  });

  it('renders safe source trail in the Right Now payload', () => {
    const state = selectSourceBackedRightNowState({
      nowIso,
      signals: [
        {
          id: 'sig_gmail_2',
          source: 'gmail',
          type: 'reply_needed',
          source_id: 'gmail-thread-456',
          occurred_at: '2026-06-02T19:40:00.000Z',
          redacted_summary: 'Partner asked for one status answer.',
          content: 'RAW PAYLOAD MUST NOT APPEAR',
        },
      ],
    });

    const payload = buildRightNowMessagePayload(state);
    expect(payload.mode).toBe('active');
    expect(payload.text).toContain('Source trail: tkg_signals/gmail/reply_needed gmail-thread-456');
    expect(payload.text).toContain('Partner asked for one status answer.');
    expect(payload.text).not.toContain('RAW PAYLOAD');
  });

  it.each(['done', 'stuck', 'break_smaller', 'snooze'] as const)(
    'preserves source_trail through %s',
    (actionId) => {
      const state = selectSourceBackedRightNowState({
        nowIso,
        signals: [
          {
            id: 'sig_calendar_2',
            source: 'calendar',
            type: 'meeting_followup',
            occurred_at: '2026-06-02T19:30:00.000Z',
            redacted_summary: 'Meeting created one follow-up decision.',
          },
        ],
      });

      const result = applyWorkdayPresenceAction(state, actionId, {
        blocker: 'Need owner answer',
        nowIso: '2026-06-02T20:10:00.000Z',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.nextState.source_trail).toEqual(state?.source_trail);
      expect(result.nextState.state_source).toBe('source_backed');
      expect(result.nextState.interaction_history).toEqual([]);
    },
  );
});
