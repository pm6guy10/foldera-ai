import { describe, expect, it } from 'vitest';
import {
  applyDirectiveOneSentenceSalvage,
  countSentences,
  leadingDirectiveSentence,
  type GeneratedDirectivePayload,
} from '../generator';

/**
 * Deterministic repro for the live blocker on issue #518: commitment-exposure
 * candidates render a directive whose imperative leads but carries a trailing
 * explanatory sentence. That two-sentence directive fails the `directive must be
 * exactly one sentence` contract, burns every paid LLM retry, then ships nothing
 * (dark verdict). No paid loop is needed to prove the failure or the fix — the
 * one-sentence check is `countSentences(directive) !== 1`.
 */
function payload(directive: string): GeneratedDirectivePayload {
  return {
    insight: 'x',
    causal_diagnosis: { why_exists_now: 'x', mechanism: 'x' },
    decision: 'ACT',
    directive,
    artifact_type: 'send_message',
    artifact: {},
    why_now: 'x',
  };
}

describe('applyDirectiveOneSentenceSalvage', () => {
  it('REPRO: a commitment directive with a trailing "why" sentence fails the one-sentence contract', () => {
    const directive =
      'Email Keri to confirm the April 8 renewal deadline. The approval window closes Friday and nothing is scheduled.';
    // This is exactly what validateGeneratedArtifact checks at the generation gate.
    expect(countSentences(directive)).toBe(2);
  });

  it('FIX: collapses the directive to its leading imperative so the contract passes', () => {
    const p = payload(
      'Email Keri to confirm the April 8 renewal deadline. The approval window closes Friday and nothing is scheduled.',
    );
    const salvaged = applyDirectiveOneSentenceSalvage(p);
    expect(salvaged).toBe(true);
    expect(countSentences(p.directive)).toBe(1);
    expect(p.directive).toBe('Email Keri to confirm the April 8 renewal deadline.');
  });

  it('preserves email dots — does not split "Email a@b.co." into two sentences', () => {
    const p = payload(
      'Email keri.nopens@dshs.wa.gov to confirm the April deadline. Get a committed date.',
    );
    const salvaged = applyDirectiveOneSentenceSalvage(p);
    expect(salvaged).toBe(true);
    expect(p.directive).toBe('Email keri.nopens@dshs.wa.gov to confirm the April deadline.');
    expect(countSentences(p.directive)).toBe(1);
  });

  it('leaves an already-one-sentence directive untouched', () => {
    const p = payload('Apply to Keri by Apr 10, 2026.');
    expect(applyDirectiveOneSentenceSalvage(p)).toBe(false);
    expect(p.directive).toBe('Apply to Keri by Apr 10, 2026.');
  });

  it('declines to salvage when the lead is context, not the move (no contentless directive)', () => {
    const p = payload('This is critical. Email Keri to confirm the deadline by Friday.');
    expect(applyDirectiveOneSentenceSalvage(p)).toBe(false);
    // Untouched → downstream deterministic fallback / SAFE_SILENCE still applies (status quo).
    expect(p.directive).toBe('This is critical. Email Keri to confirm the deadline by Friday.');
  });

  it('handles three sentences by keeping only the leading move', () => {
    const p = payload(
      'Send approver@acmecorp.io the signed SOW today. They are blocked on legal. The quarter closes next week.',
    );
    expect(applyDirectiveOneSentenceSalvage(p)).toBe(true);
    expect(p.directive).toBe('Send approver@acmecorp.io the signed SOW today.');
  });
});

describe('leadingDirectiveSentence', () => {
  it('returns the first sentence with trailing punctuation intact', () => {
    expect(
      leadingDirectiveSentence('Confirm the date with Keri today. It closes Friday.'),
    ).toBe('Confirm the date with Keri today.');
  });

  it('returns the whole string when there is only one sentence', () => {
    expect(leadingDirectiveSentence('Confirm the date with Keri today.')).toBe(
      'Confirm the date with Keri today.',
    );
  });
});
