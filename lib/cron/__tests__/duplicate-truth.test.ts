import { describe, expect, it } from 'vitest';
import {
  assessProofOutcome,
  isDevForceFreshAutoSuppressedExecutionResult,
  isVerificationStubProofResult,
  isVerificationStubPersistExecutionResult,
  selectLatestMeaningfulGenerationRow,
  summarizeRepeatedDirectiveHealth,
} from '../duplicate-truth';

describe('duplicate truth semantics', () => {
  const now = new Date('2026-04-16T18:00:00.000Z').getTime();

  it('treats old duplicate rows alone as historical backlog, not active regression', () => {
    const summary = summarizeRepeatedDirectiveHealth([
      {
        directive_text: 'Email Alex about the permit appeal deadline.',
        generated_at: '2026-04-16T08:00:00.000Z',
      },
      {
        directive_text: 'Email Alex about the permit appeal deadline.',
        generated_at: '2026-04-16T09:00:00.000Z',
      },
      {
        directive_text: 'Email Alex about the permit appeal deadline.',
        generated_at: '2026-04-16T10:00:00.000Z',
      },
    ], now);

    expect(summary.status).toBe('historical_backlog');
    expect(summary.maxCopies).toBe(3);
  });

  it('flags a new duplicate persistence as active duplicate regression', () => {
    const summary = summarizeRepeatedDirectiveHealth([
      {
        directive_text: 'Email Alex about the permit appeal deadline.',
        generated_at: '2026-04-16T15:15:00.000Z',
      },
      {
        directive_text: 'Email Alex about the permit appeal deadline.',
        generated_at: '2026-04-16T16:15:00.000Z',
      },
      {
        directive_text: 'Email Alex about the permit appeal deadline.',
        generated_at: '2026-04-16T17:45:00.000Z',
      },
    ], now);

    expect(summary.status).toBe('active_regression');
    expect(summary.maxCopies).toBe(3);
  });

  it('ignores verification-stub duplicate rows when classifying live duplicate regression', () => {
    const summary = summarizeRepeatedDirectiveHealth([
      {
        directive_text: 'Please email partner@example.com by Friday 2026-04-18 to confirm the Q2 delivery plan and deadline.',
        generated_at: '2026-04-16T15:15:00.000Z',
        verification_stub_persist: true,
      },
      {
        directive_text: 'Please email partner@example.com by Friday 2026-04-18 to confirm the Q2 delivery plan and deadline.',
        generated_at: '2026-04-16T16:15:00.000Z',
        verification_stub_persist: true,
      },
      {
        directive_text: 'Please email partner@example.com by Friday 2026-04-18 to confirm the Q2 delivery plan and deadline.',
        generated_at: '2026-04-16T17:45:00.000Z',
        verification_stub_persist: true,
      },
      {
        directive_text: 'A different real live directive',
        generated_at: '2026-04-16T17:50:00.000Z',
      },
    ], now);

    expect(summary.status).toBe('clear');
    expect(summary.maxCopies).toBe(1);
  });

  it('ignores dev force-fresh auto-suppressed ghost rows when classifying live duplicate regression', () => {
    const summary = summarizeRepeatedDirectiveHealth([
      {
        directive_text: 'Stop holding live bandwidth open for Waiting on MAS3 (HCA) hiring decision; reopen only if a concrete next-step signal arrives by 5:00 PM PT on 2026-04-21.',
        generated_at: '2026-04-16T15:15:00.000Z',
        dev_force_fresh_auto_suppressed: true,
      },
      {
        directive_text: 'Stop holding live bandwidth open for Waiting on MAS3 (HCA) hiring decision; reopen only if a concrete next-step signal arrives by 5:00 PM PT on 2026-04-21.',
        generated_at: '2026-04-16T16:15:00.000Z',
        dev_force_fresh_auto_suppressed: true,
      },
      {
        directive_text: 'Stop holding live bandwidth open for Waiting on MAS3 (HCA) hiring decision; reopen only if a concrete next-step signal arrives by 5:00 PM PT on 2026-04-21.',
        generated_at: '2026-04-16T17:45:00.000Z',
      },
      {
        directive_text: 'Stop holding live bandwidth open for Waiting on MAS3 (HCA) hiring decision; reopen only if a concrete next-step signal arrives by 5:00 PM PT on 2026-04-21.',
        generated_at: '2026-04-16T17:46:00.000Z',
      },
    ], now);

    expect(summary.status).toBe('clear');
    expect(summary.maxCopies).toBe(2);
  });

  it('ignores internal do_nothing sentinel slug rows when classifying repeated directives', () => {
    const summary = summarizeRepeatedDirectiveHealth([
      {
        directive_text: 'paid_llm_disabled',
        action_type: 'do_nothing',
        reason: 'paid_llm_disabled',
        generated_at: '2026-04-16T15:15:00.000Z',
      },
      {
        directive_text: 'paid_llm_disabled',
        action_type: 'do_nothing',
        reason: 'paid_llm_disabled',
        generated_at: '2026-04-16T16:15:00.000Z',
      },
      {
        directive_text: 'paid_llm_disabled',
        action_type: 'do_nothing',
        reason: 'paid_llm_disabled',
        generated_at: '2026-04-16T17:45:00.000Z',
      },
      {
        directive_text: 'Email Alex about the permit appeal deadline.',
        action_type: 'send_message',
        generated_at: '2026-04-16T17:50:00.000Z',
      },
    ], now);

    expect(summary.status).toBe('clear');
    expect(summary.maxCopies).toBe(1);
  });

  it('selects the latest non-verification row for last-generation truth', () => {
    const latest = selectLatestMeaningfulGenerationRow([
      {
        directive_text: 'Verification stub document',
        generated_at: '2026-04-16T17:55:00.000Z',
        execution_result: { verification_stub_persist: true },
      },
      {
        directive_text: 'Real last generation do_nothing',
        generated_at: '2026-04-16T17:45:00.000Z',
        execution_result: { outcome_type: 'no_send' },
      },
    ]);

    expect(latest?.directive_text).toBe('Real last generation do_nothing');
    expect(isVerificationStubPersistExecutionResult(latest?.execution_result)).toBe(false);
  });

  it('selects the latest non-ghost row for last-generation truth', () => {
    const latest = selectLatestMeaningfulGenerationRow([
      {
        directive_text: 'Dev force-fresh ghost row',
        generated_at: '2026-04-16T17:55:00.000Z',
        execution_result: {
          auto_suppression_reason: 'Auto-suppressed pending action for dev brain-receipt force-fresh run.',
        },
      },
      {
        directive_text: 'Real last generation write_document',
        generated_at: '2026-04-16T17:45:00.000Z',
        execution_result: { outcome_type: 'selected' },
      },
    ]);

    expect(latest?.directive_text).toBe('Real last generation write_document');
  });

  it('detects dev force-fresh auto-suppressed execution results', () => {
    expect(isDevForceFreshAutoSuppressedExecutionResult({
      auto_suppression_reason: 'Auto-suppressed pending action for dev brain-receipt force-fresh run.',
    })).toBe(true);
    expect(isDevForceFreshAutoSuppressedExecutionResult({
      auto_suppression_reason: 'Auto-suppressed stale pending action before daily brief generation.',
    })).toBe(false);
  });

  it('accepts no_send_persisted when duplicate guard blocked another persistence', () => {
    const assessment = assessProofOutcome({
      code: 'no_send_persisted',
      detail: 'All 2 candidates blocked: "Permit appeal follow-up" → duplicate_100pct_similar',
      meta: { protective_duplicate_block: true },
    });

    expect(assessment).toEqual({
      accepted: true,
      reason: 'no_send_persisted:protective_duplicate_block',
    });
  });

  it('keeps fresh-proof semantics intact for successful and generic blocked outcomes', () => {
    expect(assessProofOutcome({
      code: 'pending_approval_persisted',
    })).toEqual({
      accepted: true,
      reason: 'pending_approval_persisted',
    });

    expect(assessProofOutcome({
      code: 'no_send_persisted',
      detail: 'Artifact generation failed.',
      meta: {},
    })).toEqual({
      accepted: false,
      reason: 'no_send_persisted',
    });
  });

  it('rejects verification-stub persistence as harness-only, not product proof', () => {
    const result = {
      code: 'pending_approval_persisted',
      meta: {
        verification_stub_persist: true,
      },
    };

    expect(isVerificationStubProofResult(result)).toBe(true);
    expect(assessProofOutcome(result)).toEqual({
      accepted: false,
      reason: 'verification_stub_persist_is_harness_only',
    });
  });
});
