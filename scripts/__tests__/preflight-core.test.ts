import { describe, expect, it } from 'vitest';

import { evaluatePaidLlmGate } from '../preflight-core';

const relAgo = () => 'just now';

describe('evaluatePaidLlmGate', () => {
  it('fails when recent rows are still blocked by paid_llm_disabled', () => {
    const result = evaluatePaidLlmGate([
      {
        action_type: 'do_nothing',
        directive_text: 'paid_llm_disabled',
        generated_at: '2026-04-26T13:52:12.556+00:00',
        status: 'skipped',
        confidence: 45,
        artifact: null,
      },
      {
        action_type: 'do_nothing',
        directive_text: 'paid_llm_disabled',
        generated_at: '2026-04-26T13:24:41.966+00:00',
        status: 'skipped',
        confidence: 45,
        artifact: null,
      },
      {
        action_type: 'do_nothing',
        directive_text: 'paid_llm_disabled',
        generated_at: '2026-04-26T00:41:00.838+00:00',
        status: 'skipped',
        confidence: 45,
        artifact: null,
      },
    ], relAgo);

    expect(result.verdict).toBe('FAIL');
    expect(result.detail).toContain('3 of last 3');
  });

  it('warns when a fresher live row proves the paid gate is no longer the newest blocker', () => {
    const result = evaluatePaidLlmGate([
      {
        action_type: 'do_nothing',
        directive_text: 'Daily spend cap reached.',
        generated_at: '2026-04-26T16:15:50.316+00:00',
        status: 'skipped',
        confidence: 45,
        artifact: null,
      },
      {
        action_type: 'do_nothing',
        directive_text: 'paid_llm_disabled',
        generated_at: '2026-04-26T13:52:12.556+00:00',
        status: 'skipped',
        confidence: 45,
        artifact: null,
      },
      {
        action_type: 'do_nothing',
        directive_text: 'paid_llm_disabled',
        generated_at: '2026-04-26T13:24:41.966+00:00',
        status: 'skipped',
        confidence: 45,
        artifact: null,
      },
      {
        action_type: 'do_nothing',
        directive_text: 'paid_llm_disabled',
        generated_at: '2026-04-26T00:41:00.838+00:00',
        status: 'skipped',
        confidence: 45,
        artifact: null,
      },
    ], relAgo);

    expect(result.verdict).toBe('WARN');
    expect(result.detail).toContain('Daily spend cap reached.');
    expect(result.fix).toContain('Investigate that newer blocker');
  });

  it('passes when fewer than three recent rows are paid_llm_disabled', () => {
    const result = evaluatePaidLlmGate([
      {
        action_type: 'do_nothing',
        directive_text: 'paid_llm_disabled',
        generated_at: '2026-04-26T13:52:12.556+00:00',
        status: 'skipped',
        confidence: 45,
        artifact: null,
      },
      {
        action_type: 'write_document',
        directive_text: 'Real artifact',
        generated_at: '2026-04-25T07:32:58.802+00:00',
        status: 'pending_approval',
        confidence: 76,
        artifact: { title: 'Decision lock', type: 'document' },
      },
    ], relAgo);

    expect(result.verdict).toBe('PASS');
    expect(result.detail).toContain('1 of 2');
  });
});
