import { describe, expect, it } from 'vitest';
import {
  normalizeSimulatedConnectorEvidenceIntoTriggerContexts,
  selectSingleInterventionFromConnectorEvidence,
  type SimulatedConnectorEvidenceEvent,
} from '../evidence-adapters';

describe('connector evidence adapters (test mode)', () => {
  it('ignores noisy events', () => {
    const events: SimulatedConnectorEvidenceEvent[] = [
      {
        kind: 'calendar',
        event_id: 'evt_1',
        title: 'Weekly status',
        starts_at_iso: '2026-05-20T17:00:00.000Z',
        requires_prep: false,
      },
      {
        kind: 'gmail',
        message_id: 'msg_1',
        thread_id: '',
        from: 'person@example.com',
        subject: 'Question',
        snippet: 'Hi',
        received_at_iso: '2026-05-20T16:00:00.000Z',
        reply_needed: true,
      },
      {
        kind: 'slack',
        event_id: 'sl_1',
        thread_id: 't1',
        summary: 'thumbs up reaction',
      },
    ];

    const result = normalizeSimulatedConnectorEvidenceIntoTriggerContexts(events);
    expect(result.contexts).toHaveLength(0);
    expect(result.ignored.map((i) => i.kind)).toEqual(['calendar', 'gmail', 'slack']);
  });

  it('normalizes calendar prep into pre_meeting trigger context', () => {
    const events: SimulatedConnectorEvidenceEvent[] = [
      {
        kind: 'calendar',
        event_id: 'evt_2',
        title: 'Interview loop',
        starts_at_iso: '2026-05-20T18:00:00.000Z',
        requires_prep: true,
        prep_move: 'Draft 3 questions.',
      },
    ];

    const result = normalizeSimulatedConnectorEvidenceIntoTriggerContexts(events);
    expect(result.contexts).toEqual([
      {
        trigger_type: 'pre_meeting',
        event: {
          title: 'Interview loop',
          starts_at_iso: '2026-05-20T18:00:00.000Z',
          requires_prep: true,
          prep_move: 'Draft 3 questions.',
        },
      },
    ]);
  });

  it('collapses multiple reply-needed signals into one intervention (highest priority)', () => {
    const events: SimulatedConnectorEvidenceEvent[] = [
      {
        kind: 'calendar',
        event_id: 'evt_3',
        title: 'Planning meeting',
        starts_at_iso: '2026-05-20T19:00:00.000Z',
        requires_prep: true,
      },
      {
        kind: 'slack',
        event_id: 'sl_2',
        thread_id: 'thread_123',
        summary: 'Mentioned you: can you reply?',
        reply_needed: true,
      },
      {
        kind: 'gmail',
        message_id: 'msg_2',
        thread_id: 'email_thread_9',
        from: 'lead@example.com',
        subject: 'Need a quick reply',
        snippet: 'Can you confirm?',
        received_at_iso: '2026-05-20T15:59:00.000Z',
        reply_needed: true,
      },
      // duplicate slack signal for the same thread should collapse
      {
        kind: 'slack',
        event_id: 'sl_3',
        thread_id: 'thread_123',
        summary: 'Follow-up ping',
        reply_needed: true,
      },
    ];

    const selection = selectSingleInterventionFromConnectorEvidence(events);
    expect(selection.selected).toBeTruthy();
    expect(selection.reason).toMatch(/collapsed/i);
    expect(selection.candidate_count).toBe(4);
    expect(selection.selected!.trigger_type).toBe('mention_reply_needed');
  });
});

