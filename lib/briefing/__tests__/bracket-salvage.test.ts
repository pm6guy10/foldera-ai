import { describe, expect, it } from 'vitest';
import { applyBracketTemplateSalvage, type StructuredContext } from '../generator';

function minimalCtx(overrides: Partial<StructuredContext> = {}): StructuredContext {
  return {
    selected_candidate: 'test',
    candidate_class: 'discrepancy',
    candidate_title: 'Deadline theme across contacts',
    candidate_reason: 'Multiple commitments show overdue follow-ups that block forward motion on stated goals.',
    candidate_goal: null,
    matched_goal_category: 'career',
    candidate_score: 4,
    candidate_due_date: null,
    candidate_context_enrichment: null,
    supporting_signals: [],
    life_context_signals: [],
    surgical_raw_facts: [],
    active_goals: [],
    locked_constraints: null,
    locked_contacts_prompt: null,
    recent_action_history_7d: [],
    has_real_target: true,
    has_real_recipient: false,
    has_recent_evidence: true,
    already_acted_recently: false,
    decision_already_made: false,
    can_execute_without_editing: true,
    has_due_date_or_time_anchor: false,
    conflicts_with_locked_constraints: false,
    constraint_violation_codes: [],
    researcher_insight: null,
    user_identity_context: null,
    user_full_name: 'Test User',
    user_first_name: 'Test',
    goal_gap_analysis: [],
    already_sent_14d: [],
    behavioral_mirrors: [],
    conviction_math: null,
    behavioral_history: null,
    avoidance_observations: [],
    relationship_timeline: null,
    competition_context: null,
    confidence_prior: 70,
    required_causal_diagnosis: {
      why_exists_now: 'Signals show stalled threads.',
      mechanism: 'Avoidance of concrete reply.',
    },
    trigger_context: null,
    recipient_brief: null,
    hunt_send_message_recipient_allowlist: [],
    discrepancy_class: 'behavioral_pattern',
    candidate_analysis: '',
    entity_analysis: null,
    entity_conversation_state: null,
    user_voice_patterns: null,
    ...overrides,
  } as StructuredContext;
}

describe('applyBracketTemplateSalvage', () => {
  it('replaces write_document title bracket slot with candidate_reason-derived fallback', () => {
    const ctx = minimalCtx();
    const payload = {
      insight: 'x',
      causal_diagnosis: ctx.required_causal_diagnosis,
      causal_diagnosis_source: 'template_fallback' as const,
      decision: 'ACT' as const,
      directive: 'One sentence directive here for the user.',
      artifact_type: 'write_document' as const,
      artifact: {
        document_purpose: 'Audit',
        target_reader: 'User',
        title: 'Status [date] for contacts',
        content: 'x'.repeat(120),
      },
      why_now: 'Because now.',
    };
    const ok = applyBracketTemplateSalvage(payload, ctx, 'user-1');
    expect(ok).toBe(true);
    expect(payload.artifact.title).not.toMatch(/\[(?:date|name)\]/i);
    expect(payload.artifact.title).toContain('Multiple commitments');
    expect(payload.artifact.content).toContain('x');
  });

  it('does not mutate to/recipient when they contain bracket-like text', () => {
    const ctx = minimalCtx();
    const payload = {
      insight: 'x',
      causal_diagnosis: ctx.required_causal_diagnosis,
      causal_diagnosis_source: 'template_fallback' as const,
      decision: 'ACT' as const,
      directive: 'One sentence directive here for the user.',
      artifact_type: 'send_message' as const,
      artifact: {
        to: 'a@b.com',
        subject: 'Hello [name]',
        body: 'y'.repeat(80),
      },
      why_now: 'Because now.',
    };
    applyBracketTemplateSalvage(payload, ctx);
    expect(payload.artifact.to).toBe('a@b.com');
    expect(payload.artifact.subject).not.toContain('[name]');
  });
});
