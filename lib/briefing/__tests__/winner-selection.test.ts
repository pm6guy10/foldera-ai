import { describe, expect, it } from 'vitest';
import { selectFinalWinner } from '../generator';
import type { ScoredLoop } from '../scorer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_BREAKDOWN = {
  stakes: 3,
  urgency: 0.6,
  tractability: 0.7,
  freshness: 0.8,
  actionTypeRate: 0.5,
  entityPenalty: 0,
};

function makeCandidate(overrides: Partial<ScoredLoop> & { score: number }): ScoredLoop {
  return {
    id: overrides.id ?? 'cand-1',
    type: overrides.type ?? 'signal',
    title: overrides.title ?? 'Test candidate',
    content: overrides.content ?? 'Some content about the candidate.',
    suggestedActionType: overrides.suggestedActionType ?? 'write_document',
    matchedGoal: overrides.matchedGoal ?? null,
    score: overrides.score,
    breakdown: overrides.breakdown ?? BASE_BREAKDOWN,
    relatedSignals: overrides.relatedSignals ?? [],
    sourceSignals: overrides.sourceSignals ?? [],
    ...overrides,
  };
}

const NO_GUARDRAILS = { approvedRecently: [], skippedRecently: [] };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('selectFinalWinner', () => {
  it('single candidate always wins', () => {
    const candidate = makeCandidate({ score: 2.0 });
    const result = selectFinalWinner([candidate], NO_GUARDRAILS);
    expect(result.winner).toBe(candidate);
    expect(result.competitionContext).toBe('');
  });

  it('throws on empty candidate list', () => {
    expect(() => selectFinalWinner([], NO_GUARDRAILS)).toThrow('empty candidate list');
  });

  it('top scorer wins when both are equal viability', () => {
    const high = makeCandidate({ id: 'high', score: 3.0, title: 'High scorer' });
    const low = makeCandidate({ id: 'low', score: 1.5, title: 'Low scorer' });
    const { winner } = selectFinalWinner([high, low], NO_GUARDRAILS);
    expect(winner.id).toBe('high');
  });

  it('send_message without email in signals is downgraded vs runner-up with email', () => {
    const topNoEmail = makeCandidate({
      id: 'top',
      score: 3.0,
      title: 'Follow up on something',
      suggestedActionType: 'send_message',
      content: 'No email address here at all.',
    });
    const runnerUpWithEmail = makeCandidate({
      id: 'runner',
      score: 2.6,
      title: 'Respond to Alice',
      suggestedActionType: 'send_message',
      content: 'alice@permitsoffice.gov sent a message about the permit.',
    });

    const { winner } = selectFinalWinner([topNoEmail, runnerUpWithEmail], NO_GUARDRAILS);
    // topNoEmail: 3.0 * 0.80 = 2.40 — runner-up (2.6) beats it
    expect(winner.id).toBe('runner');
  });

  it('commitment type gets +12% viability bonus', () => {
    const commitment = makeCandidate({
      id: 'commit',
      score: 2.0,
      type: 'commitment',
      title: 'File permit appeal by Friday',
    });
    const plain = makeCandidate({
      id: 'plain',
      score: 2.1,
      type: 'signal',
      title: 'Generic follow-up',
    });

    // commitment: 2.0 * 1.12 = 2.24 > plain: 2.1
    const { winner } = selectFinalWinner([plain, commitment], NO_GUARDRAILS);
    expect(winner.id).toBe('commit');
  });

  it('already-acted-recently candidate is disqualified and falls back to runner-up', () => {
    const recentTitle = 'Send update to Bob about the contract';
    const stale = makeCandidate({
      id: 'stale',
      score: 4.0,
      title: recentTitle,
    });
    const fresh = makeCandidate({
      id: 'fresh',
      score: 2.0,
      title: 'Review permit appeal draft',
    });

    const guardrails = {
      approvedRecently: [
        { directive_text: recentTitle, action_type: 'send_message', generated_at: new Date().toISOString() },
      ],
      skippedRecently: [],
    };

    const { winner } = selectFinalWinner([stale, fresh], guardrails);
    expect(winner.id).toBe('fresh');
  });

  it('all disqualified falls back to scored[0]', () => {
    const title1 = 'Send follow up to Carol about the invoice payment';
    const title2 = 'Send follow up to Dave about the grant application';
    const c1 = makeCandidate({ id: 'c1', score: 3.0, title: title1 });
    const c2 = makeCandidate({ id: 'c2', score: 2.5, title: title2 });

    const guardrails = {
      approvedRecently: [
        { directive_text: title1, action_type: 'send_message', generated_at: new Date().toISOString() },
        { directive_text: title2, action_type: 'send_message', generated_at: new Date().toISOString() },
      ],
      skippedRecently: [],
    };

    // Both disqualified — should fall back to topCandidates[0]
    const { winner } = selectFinalWinner([c1, c2], guardrails);
    expect(winner.id).toBe('c1');
  });

  it('competition context lists beaten candidates', () => {
    const high = makeCandidate({ id: 'high', score: 3.0, title: 'Top item to do' });
    const low = makeCandidate({ id: 'low', score: 1.5, title: 'Lower priority item' });
    const { competitionContext } = selectFinalWinner([high, low], NO_GUARDRAILS);
    expect(competitionContext).toContain('CANDIDATE_COMPETITION');
    expect(competitionContext).toContain('Winner:');
    expect(competitionContext).toContain('Beaten:');
  });

  it('fresh signal (≤2d) gets +8% bonus over stale signal (>10d)', () => {
    const freshMs = Date.now() - 1 * 24 * 60 * 60 * 1000; // 1 day ago
    const staleMs = Date.now() - 15 * 24 * 60 * 60 * 1000; // 15 days ago

    const freshCand = makeCandidate({
      id: 'fresh',
      score: 2.0,
      title: 'Act on recent message',
      sourceSignals: [{ kind: 'signal', occurredAt: new Date(freshMs).toISOString() }],
    });
    const staleCand = makeCandidate({
      id: 'stale',
      score: 2.2,
      title: 'Old unresolved thing',
      sourceSignals: [{ kind: 'signal', occurredAt: new Date(staleMs).toISOString() }],
    });

    // fresh: 2.0 * 1.08 = 2.16; stale: 2.2 * 0.88 = 1.936 — fresh wins
    const { winner } = selectFinalWinner([staleCand, freshCand], NO_GUARDRAILS);
    expect(winner.id).toBe('fresh');
  });
});
