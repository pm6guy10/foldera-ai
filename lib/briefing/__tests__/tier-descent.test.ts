import { describe, expect, it } from 'vitest';
import type { ScoredLoop } from '../scorer';
import { attemptTierDescentDirective, isLowValueErrandCommitment } from '../generator';

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

  it('(g) Tier 2 drops a junk/errand commitment and falls through (no nag-on-junk)', async () => {
    // Live-observed junk: "Book hotel using $35.16 OneKeyCash" must NOT ship as the never-go-dark act.
    const junk = {
      id: 'c-junk',
      description: 'Book hotel using $35.16 OneKeyCash balance',
      due_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const result = await attemptTierDescentDirective({
      userId: 'user-1',
      supabase: makeSupabaseMock([junk]),
      topCandidates: [],
      candidateDiscovery: null,
    });
    // Junk dropped, Tier 3 empty → honest do_nothing (null), not a hotel-booking nag.
    expect(result).toBeNull();
  });

  it('(h) Tier 2 skips junk to the first substantive survivor', async () => {
    const junk = {
      id: 'c-junk',
      description: 'Amazon shoes',
      due_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    };
    const result = await attemptTierDescentDirective({
      userId: 'user-1',
      supabase: makeSupabaseMock([junk, NEAR_COMMITMENT]),
      topCandidates: [],
      candidateDiscovery: null,
    });
    expect(result).not.toBeNull();
    expect(result!.directive).toContain('ESB Technician interview questions');
    expect(result!.generationLog?.tier_descent_winner).toBe('tier2_commitment_due');
  });
});

describe('isLowValueErrandCommitment', () => {
  it('flags live-observed junk (errands, shopping, loyalty, marketing)', () => {
    for (const junk of [
      'Babe massage',
      'Amazon shoes',
      "Buy mother's Day present",
      'Book hotel using $35.16 OneKeyCash balance',
      "Reply with 'Keep' or 'Remove' to confirm email subscription",
      'Register for Healing Streams Viewers & Partners Summit',
      "Mom's birthday",
    ]) {
      expect(isLowValueErrandCommitment(junk)).toBe(true);
    }
  });

  it('does NOT flag substantive professional work', () => {
    for (const real of [
      'Complete ESB Technician interview questions',
      'Confirm orientation details in writing and provide alternatives',
      'Send follow-up once document review is complete',
      'File Rule 59(e) motion correcting judicial error',
    ]) {
      expect(isLowValueErrandCommitment(real)).toBe(false);
    }
  });

  it('flags empty/blank descriptions defensively', () => {
    expect(isLowValueErrandCommitment('')).toBe(true);
    expect(isLowValueErrandCommitment(null)).toBe(true);
    expect(isLowValueErrandCommitment(undefined)).toBe(true);
  });
});
