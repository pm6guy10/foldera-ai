import { describe, expect, it } from 'vitest';
import { getLowCrossSignalIssues } from '../generator';
import type { GeneratedDirectivePayload, StructuredContext } from '../generator';

/** Minimal ctx for the cross-signal anchor gate (two anchors; haystack omits both). */
function baseCtx(overrides: Partial<StructuredContext>): StructuredContext {
  return {
    selected_candidate: 'DISCREPANCY: test',
    candidate_class: 'discrepancy',
    candidate_title: 'Calendar overlap between standup and client review',
    candidate_reason: 'reason',
    candidate_goal: null,
    matched_goal_category: 'project',
    candidate_score: 4.2,
    candidate_due_date: null,
    candidate_context_enrichment: null,
    supporting_signals: [
      {
        source: 'google_calendar',
        occurred_at: '2026-04-13T14:00:00Z',
        entity: 'Acme Corp Review',
        summary: 'Client review block',
        direction: 'unknown',
      },
      {
        source: 'outlook_calendar',
        occurred_at: '2026-04-13T14:05:00Z',
        entity: 'Team Standup',
        summary: 'Daily sync',
        direction: 'unknown',
      },
    ],
    life_context_signals: [],
    surgical_raw_facts: [],
    active_goals: ['Ship the roadmap'],
    locked_constraints: null,
    locked_contacts_prompt: null,
    recent_action_history_7d: [],
    has_real_target: true,
    has_real_recipient: false,
    has_recent_evidence: true,
    already_acted_recently: false,
    decision_already_made: false,
    can_execute_without_editing: false,
    recipient_brief: null,
    discrepancy_class: 'schedule_conflict',
    insight_scan_winner: false,
    candidate_analysis: '',
    entity_analysis: '',
    entity_conversation_state: null,
    user_voice_patterns: null,
    hunt_send_message_recipient_allowlist: [],
    response_pattern_lines: [],
    ...overrides,
  } as StructuredContext;
}

describe('getLowCrossSignalIssues — discrepancy write_document', () => {
  it('does not require two literal anchor hits for discrepancy write_document (paraphrase-safe)', () => {
    const ctx = baseCtx({});
    const payload: GeneratedDirectivePayload = {
      decision: 'ACT',
      directive: 'Resolve the overlapping afternoon commitments using the numbered steps in the memo.',
      insight:
        'Two calendar blocks claim the same window; pick one owner to move or shorten so prep is protected.',
      why_now: 'The conflict is within 48 hours and affects an external client touchpoint.',
      causal_diagnosis: {
        why_exists_now: 'Both holds predate the latest schedule change.',
        mechanism: 'calendar drift',
      },
      artifact_type: 'write_document',
      artifact: {
        document_purpose: 'One-page resolution',
        target_reader: 'You',
        title: 'Afternoon conflict resolution',
        // Generic prose: does not contain "google_calendar", "acme", "standup", "outlook", etc.
        content:
          'Situation: two meetings claim the same window. Step 1: confirm which has the firmer external commitment. Step 2: propose a 15-minute slide to the internal sync. Step 3: send a one-line update to stakeholders with the new times. NEXT_ACTION: Confirm the moved slot by 5pm today. Owner: you.',
      },
    };

    expect(getLowCrossSignalIssues(payload, ctx, 'write_document')).toEqual([]);
  });

  it('still enforces the anchor bar for non-discrepancy write_document when anchors exist', () => {
    const ctx = baseCtx({
      candidate_class: 'signal',
      discrepancy_class: null,
    });
    const payload: GeneratedDirectivePayload = {
      decision: 'ACT',
      directive: 'Do the thing described in the memo with two grounded hooks from context.',
      insight: 'insight',
      why_now: 'why',
      causal_diagnosis: {
        why_exists_now: 'x',
        mechanism: 'y',
      },
      artifact_type: 'write_document',
      artifact: {
        document_purpose: 'p',
        target_reader: 'You',
        title: 't',
        content:
          'Situation: two meetings claim the same window. Step 1: confirm which has the firmer external commitment. Step 2: propose a 15-minute slide to the internal sync. Step 3: send a one-line update to stakeholders with the new times. NEXT_ACTION: Confirm the moved slot by 5pm today. Owner: you.',
      },
    };

    const issues = getLowCrossSignalIssues(payload, ctx, 'write_document');
    expect(issues.some((i) => i.startsWith('low_cross_signal:'))).toBe(true);
  });
});
