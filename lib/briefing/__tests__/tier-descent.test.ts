import { describe, expect, it } from 'vitest';
import type { ScoredLoop } from '../scorer';
import { attemptTierDescentDirective } from '../generator';

// Chainable Supabase mock — resolves at .limit() with caller-supplied rows.
function makeSupabaseMock(
  commitments: Array<{ id: string; description: string; due_at: string }>,
) {
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    in() { return chain; },
    is() { return chain; },
    not() { return chain; },
    gte() { return chain; },
    lte() { return chain; },
    order() { return chain; },
    limit() { return Promise.resolve({ data: commitments, error: null }); },
  };
  return { from: () => chain } as unknown as Parameters<typeof attemptTierDescentDirective>[0]['supabase'];
}

function makeSendCandidate(overrides: Partial<ScoredLoop> = {}): ScoredLoop {
  return {
    id: 'loop-1',
    type: 'commitment',
    // entityName is required for isThreadBackedSendableLoop to pass on commitment/relationship.
    entityName: 'Sarah Kim',
    title: 'Reply to Sarah Kim about the onboarding call',
    content: 'Sarah asked you to confirm the June 27 call.',
    suggestedActionType: 'send_message',
    matchedGoal: null,
    score: 0.8,
    breakdown: {} as ScoredLoop['breakdown'],
    relatedSignals: [],
    sourceSignals: [],
    confidence_prior: 50,
    ...overrides,
  };
}

// A commitment due in 7 days — always within the 14d Tier-2 window.
const NEAR_COMMITMENT = {
  id: 'c-1',
  description: 'Complete ESB Technician interview questions',
  due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
};

describe('attemptTierDescentDirective', () => {
  it('(a) Tier 2 fires when a commitment is due ≤14d and returns write_document', async () => {
    const result = await attemptTierDescentDirective({
      userId: 'user-1',
      supabase: makeSupabaseMock([NEAR_COMMITMENT]),
      topCandidates: [],
      candidateDiscovery: null,
    });

    expect(result).not.toBeNull();
    expect(result!.action_type).toBe('write_document');
    expect(result!.directive).toContain('ESB Technician interview questions');
    expect(result!.confidence).toBe(55);
    expect(result!.generationLog?.tier_descent_winner).toBe('tier2_commitment_due');
    expect(result!.evidence[0].type).toBe('commitment');
  });

  it('(b) Tier 3 fires when Tier 2 empty and a send_message candidate is present', async () => {
    const result = await attemptTierDescentDirective({
      userId: 'user-1',
      supabase: makeSupabaseMock([]),
      topCandidates: [makeSendCandidate()],
      candidateDiscovery: null,
    });

    expect(result).not.toBeNull();
    expect(result!.action_type).toBe('send_message');
    expect(result!.directive).toContain('Reply to Sarah Kim');
    expect(result!.confidence).toBe(45);
    expect(result!.generationLog?.tier_descent_winner).toBe('tier3_send_message_owed');
    expect(result!.evidence[0].type).toBe('commitment');
  });

  it('(c) returns null when both Tier 2 and Tier 3 are genuinely empty', async () => {
    const result = await attemptTierDescentDirective({
      userId: 'user-1',
      supabase: makeSupabaseMock([]),
      topCandidates: [],
      candidateDiscovery: null,
    });

    expect(result).toBeNull();
  });

  it('(d) Tier 3 skips signal-type candidates — only thread-backed (commitment/relationship) qualify', async () => {
    // signal type returns false from isThreadBackedSendableLoop
    const signalOnly = makeSendCandidate({ type: 'signal', id: 'loop-signal', entityName: undefined });
    const result = await attemptTierDescentDirective({
      userId: 'user-1',
      supabase: makeSupabaseMock([]),
      topCandidates: [signalOnly],
      candidateDiscovery: null,
    });

    expect(result).toBeNull();
  });

  it('(e) Tier 2 wins over Tier 3 when both are available', async () => {
    const result = await attemptTierDescentDirective({
      userId: 'user-1',
      supabase: makeSupabaseMock([NEAR_COMMITMENT]),
      topCandidates: [makeSendCandidate()],
      candidateDiscovery: null,
    });

    expect(result!.action_type).toBe('write_document');
    expect(result!.generationLog?.tier_descent_winner).toBe('tier2_commitment_due');
  });

  it('(f) Tier 3 uses signal evidence type for relationship-type candidates', async () => {
    const relCandidate = makeSendCandidate({ type: 'relationship', id: 'loop-rel' });
    const result = await attemptTierDescentDirective({
      userId: 'user-1',
      supabase: makeSupabaseMock([]),
      topCandidates: [relCandidate],
      candidateDiscovery: null,
    });

    expect(result).not.toBeNull();
    expect(result!.evidence[0].type).toBe('signal');
    expect(result!.generationLog?.tier_descent_winner).toBe('tier3_send_message_owed');
  });
});
