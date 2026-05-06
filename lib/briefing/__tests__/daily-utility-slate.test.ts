import { describe, expect, it } from 'vitest';
import { buildDailyUtilitySlateFromReceipts } from '../daily-utility-slate';

const noSendReceipt = {
  id: 'no-send-1',
  action_type: 'do_nothing',
  directive_text: 'Nothing cleared the bar today after evaluating candidates.',
  reason:
    'Selected candidate failed discrepancy-card quality: weak_risk; weak_next_action; reminder_without_risk',
  status: 'skipped',
  generated_at: '2026-05-06T13:43:52.405Z',
  execution_result: {
    outcome_type: 'no_send',
    generation_log: {
      outcome: 'no_send',
      stage: 'validation',
      reason:
        'Selected candidate failed discrepancy-card quality: weak_risk; weak_next_action; reminder_without_risk',
      candidateDiscovery: {
        candidateCount: 2,
        suppressedCandidateCount: 0,
        selectionMargin: null,
        selectionReason: null,
        failureReason:
          'Selected candidate failed discrepancy-card quality: weak_risk; weak_next_action; reminder_without_risk',
        topCandidates: [
          {
            id: 'calendar-gap-1',
            rank: 1,
            candidateType: 'discrepancy',
            actionType: 'write_document',
            score: 0.71,
            scoreBreakdown: {
              stakes: 0.7,
              urgency: 0.6,
              tractability: 0.5,
              freshness: 0.8,
              actionTypeRate: 0.5,
              entityPenalty: 0,
            },
            targetGoal: null,
            sourceSignals: [],
            decision: 'selected',
            decisionReason: 'positive_winner_contract:missing_schedule_resolution_context',
          },
        ],
      },
    },
  },
};

describe('Daily Utility Slate', () => {
  it('builds a conservative watch item from a persisted no-send receipt', () => {
    const slate = buildDailyUtilitySlateFromReceipts([noSendReceipt]);

    expect(slate).toEqual(
      expect.objectContaining({
        generated_at: '2026-05-06T13:43:52.405Z',
        finished_artifact_verdict: 'no_finished_artifact',
        blocked_but_real: null,
        watch_item: expect.objectContaining({
          title: 'No safe finished action today',
          evidence: expect.arrayContaining([
            'Latest run stopped before a finished action was safe.',
            'Why Foldera stopped: The strongest possible action did not prove a concrete consequence. It did not prove one safe next step. It looked like a reminder, not a risk-backed intervention.',
          ]),
        }),
      }),
    );
  });

  it('refuses to create a slate from empty receipts', () => {
    expect(buildDailyUtilitySlateFromReceipts([])).toBeNull();
    expect(buildDailyUtilitySlateFromReceipts([{ action_type: 'write_document' }])).toBeNull();
  });

  it('does not leak internal blocker codes or candidate ids', () => {
    const slate = buildDailyUtilitySlateFromReceipts([noSendReceipt]);
    const serialized = JSON.stringify(slate);

    expect(serialized).not.toContain('weak_risk');
    expect(serialized).not.toContain('weak_next_action');
    expect(serialized).not.toContain('reminder_without_risk');
    expect(serialized).not.toContain('positive_winner_contract');
    expect(serialized).not.toContain('missing_schedule_resolution_context');
    expect(serialized).not.toContain('calendar-gap-1');
  });

  it('does not leak production candidate-count language', () => {
    const slate = buildDailyUtilitySlateFromReceipts([
      {
        action_type: 'do_nothing',
        reason: 'Nothing cleared the bar today after evaluating 9 candidates.',
        status: 'skipped',
        generated_at: '2026-05-06T14:43:52.405Z',
        execution_result: { outcome_type: 'no_send' },
      },
    ]);
    const serialized = JSON.stringify(slate);

    expect(serialized).toContain('Nothing cleared the bar today.');
    expect(serialized).not.toMatch(/candidates?/i);
  });
});
