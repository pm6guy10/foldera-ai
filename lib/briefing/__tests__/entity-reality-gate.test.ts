import { describe, it, expect } from 'vitest';
import {
  applyEntityRealityGate,
  buildVerifiedEntitySet,
  type EntityGateCandidate,
  type EntityRecord,
  type SignalRecord,
} from '../entity-reality-gate';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandidate(overrides: Partial<EntityGateCandidate> = {}): EntityGateCandidate {
  return {
    id: 'c-1',
    type: 'commitment',
    title: 'Send contract to Sarah Chen',
    content: 'Sarah Chen requested the contract by Friday.',
    actionType: 'send_message',
    urgency: 0.7,
    matchedGoal: { text: 'Close Q3 deal', priority: 1, category: 'financial' },
    domain: 'financial',
    sourceSignals: [{ kind: 'commitment' as const, occurredAt: new Date().toISOString() }],
    ...overrides,
  };
}

const KNOWN_ENTITIES: EntityRecord[] = [
  { name: 'Sarah Chen', total_interactions: 12, trust_class: 'trusted' },
  { name: 'Sam Devore', total_interactions: 23, trust_class: 'trusted' },
  { name: 'Michael Torres', total_interactions: 5, trust_class: 'unclassified' },
];

const SIGNAL_HISTORY: SignalRecord[] = [
  {
    content: 'Email from Sarah Chen about contract review',
    source: 'gmail',
    author: 'Sarah Chen <sarah@example.com>',
    type: 'email_received',
  },
  {
    content: 'Calendar meeting with Sam Devore about project planning',
    source: 'google_calendar',
    author: 'Sam Devore <sam@devore.com>',
    type: 'calendar_event',
  },
  {
    content: 'Email from Lisa Park at Acme Corp about partnership proposal',
    source: 'outlook',
    author: 'Lisa Park <lisa@acme.com>',
    type: 'email_received',
  },
  {
    content: 'Follow-up from Lisa Park on the partnership timeline',
    source: 'outlook',
    author: 'Lisa Park <lisa@acme.com>',
    type: 'email_received',
  },
];

// ---------------------------------------------------------------------------
// buildVerifiedEntitySet
// ---------------------------------------------------------------------------

describe('buildVerifiedEntitySet', () => {
  it('includes entities from tkg_entities', () => {
    const set = buildVerifiedEntitySet(KNOWN_ENTITIES, []);
    expect(set.has('sarah chen')).toBe(true);
    expect(set.has('sam devore')).toBe(true);
    expect(set.has('michael torres')).toBe(true);
  });

  it('includes first names from tkg_entities', () => {
    const set = buildVerifiedEntitySet(KNOWN_ENTITIES, []);
    expect(set.has('sarah')).toBe(true);
    expect(set.has('sam')).toBe(true);
  });

  it('excludes self entity', () => {
    const set = buildVerifiedEntitySet(
      [{ name: 'self', total_interactions: 100 }],
      [],
    );
    expect(set.has('self')).toBe(false);
  });

  it('includes entities from signal authors', () => {
    const set = buildVerifiedEntitySet([], SIGNAL_HISTORY);
    expect(set.has('sarah chen')).toBe(true);
    expect(set.has('lisa park')).toBe(true);
  });

  it('includes entities appearing in >= 2 signals', () => {
    const signals: SignalRecord[] = [
      { content: 'Meeting with David Kim about roadmap', source: 'gmail' },
      { content: 'David Kim sent the final specs', source: 'gmail' },
    ];
    const set = buildVerifiedEntitySet([], signals);
    expect(set.has('david kim')).toBe(true);
  });

  it('does not verify entities appearing in only 1 signal without author', () => {
    const signals: SignalRecord[] = [
      { content: 'One-off mention of Random Stranger in a thread', source: 'gmail' },
    ];
    const set = buildVerifiedEntitySet([], signals);
    expect(set.has('random stranger')).toBe(false);
  });

  it('ignores entities from promo content in signal count', () => {
    const signals: SignalRecord[] = [
      { content: 'Newsletter from Marketing Pro with special offer', source: 'gmail' },
      { content: 'Unsubscribe from Marketing Pro newsletter', source: 'gmail' },
    ];
    const set = buildVerifiedEntitySet([], signals);
    expect(set.has('marketing pro')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyEntityRealityGate — verified entities pass
// ---------------------------------------------------------------------------

describe('Entity Reality Gate — verified entities pass', () => {
  it('passes candidate with entity in tkg_entities', () => {
    const c = makeCandidate();
    const result = applyEntityRealityGate([c], KNOWN_ENTITIES, SIGNAL_HISTORY);
    expect(result.passed).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it('passes relationship candidate with known entityName', () => {
    const c = makeCandidate({
      type: 'relationship',
      entityName: 'Sam Devore',
      title: 'Follow up with Sam Devore',
      content: 'Sam Devore: last contact 5 days ago, 23 total interactions.',
    });
    const result = applyEntityRealityGate([c], KNOWN_ENTITIES, SIGNAL_HISTORY);
    expect(result.passed).toHaveLength(1);
  });

  it('passes candidate with entity verified via signal author', () => {
    const c = makeCandidate({
      title: 'Reply to Lisa Park',
      content: 'Lisa Park at Acme Corp wants to finalize the partnership terms.',
    });
    const result = applyEntityRealityGate([c], [], SIGNAL_HISTORY);
    expect(result.passed).toHaveLength(1);
  });

  it('passes candidate with entity appearing in 2+ signals', () => {
    const signals: SignalRecord[] = [
      { content: 'James Wilson sent the budget report', source: 'gmail' },
      { content: 'James Wilson confirmed the meeting', source: 'gmail' },
    ];
    const c = makeCandidate({
      title: 'Follow up with James Wilson',
      content: 'James Wilson has the budget report pending review.',
    });
    const result = applyEntityRealityGate([c], [], signals);
    expect(result.passed).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// applyEntityRealityGate — unverified entities dropped
// ---------------------------------------------------------------------------

describe('Entity Reality Gate — unverified entities dropped', () => {
  it('drops candidate with entity not in any verified source', () => {
    const c = makeCandidate({
      title: 'Contact Unknown Person',
      content: 'Unknown Person mentioned something about a project.',
    });
    const result = applyEntityRealityGate([c], KNOWN_ENTITIES, SIGNAL_HISTORY);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].reason).toBe('single_appearance_no_email');
  });

  it('drops candidate with no entity detected', () => {
    const c = makeCandidate({
      title: 'check the status',
      content: 'need to review the document and update progress.',
    });
    const result = applyEntityRealityGate([c], KNOWN_ENTITIES, SIGNAL_HISTORY);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].reason).toBe('no_entity_detected');
  });

  it('drops newsletter/promo content', () => {
    const c = makeCandidate({
      title: 'Newsletter from Tech Weekly',
      content: 'Weekly newsletter from Tech Weekly. Unsubscribe here. Sarah Chen mentioned.',
    });
    const result = applyEntityRealityGate([c], KNOWN_ENTITIES, SIGNAL_HISTORY);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].reason).toBe('newsletter_promo_source');
  });

  it('drops webinar/promo source entities', () => {
    const c = makeCandidate({
      title: 'Webinar invitation from John Smith',
      content: 'Free webinar: John Smith on AI trends. Register now for limited time offer.',
    });
    const result = applyEntityRealityGate([c], KNOWN_ENTITIES, SIGNAL_HISTORY);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].reason).toBe('newsletter_promo_source');
  });

  it('passes 1:1 signal when promo keywords exist only in footer past scan head', () => {
    const filler = 'x'.repeat(3600);
    const c = makeCandidate({
      type: 'signal',
      title: 'Re: interview next steps',
      content: `Thanks for your time today. We will follow up shortly.\n${filler}\nUnsubscribe from this thread.`,
      author: 'Sarah Chen <sarah@example.com>',
    });
    const result = applyEntityRealityGate([c], KNOWN_ENTITIES, SIGNAL_HISTORY);
    expect(result.passed).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it('passes signal without structured author when footer alone contains promo keywords', () => {
    const filler = 'x'.repeat(3600);
    const c = makeCandidate({
      type: 'signal',
      title: 'Sarah Chen sent interview availability',
      content: `Sarah Chen confirmed she can meet Tuesday.\n${filler}\nUnsubscribe from future messages.`,
    });
    const result = applyEntityRealityGate([c], KNOWN_ENTITIES, SIGNAL_HISTORY);
    expect(result.passed).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it('still drops 1:1 signal when promo keywords appear in scanned head', () => {
    const c = makeCandidate({
      type: 'signal',
      title: 'Weekly digest',
      content: 'Unsubscribe here if you no longer want updates.',
      author: 'Sarah Chen <sarah@example.com>',
    });
    const result = applyEntityRealityGate([c], KNOWN_ENTITIES, SIGNAL_HISTORY);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].reason).toBe('newsletter_promo_source');
  });

  it('drops entity appearing only once with no email', () => {
    const c = makeCandidate({
      title: 'Talk to Random Visitor',
      content: 'Random Visitor left a comment on the blog.',
    });
    const result = applyEntityRealityGate([c], [], []);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].reason).toBe('single_appearance_no_email');
  });
});

// ---------------------------------------------------------------------------
// Output structure
// ---------------------------------------------------------------------------

describe('Entity Reality Gate — output structure', () => {
  it('returns verified and unverified entity lists', () => {
    const candidates = [
      makeCandidate({ id: 'c-1' }), // Sarah Chen — verified
      makeCandidate({
        id: 'c-2',
        title: 'Contact Unknown Person',
        content: 'Unknown Person at some company.',
      }), // Not verified
    ];
    const result = applyEntityRealityGate(candidates, KNOWN_ENTITIES, SIGNAL_HISTORY);
    expect(result.passed).toHaveLength(1);
    expect(result.dropped).toHaveLength(1);
    expect(result.verifiedEntities.length).toBeGreaterThan(0);
    expect(result.unverifiedEntities.length).toBeGreaterThan(0);
  });

  it('handles empty candidate list', () => {
    const result = applyEntityRealityGate([], KNOWN_ENTITIES, SIGNAL_HISTORY);
    expect(result.passed).toHaveLength(0);
    expect(result.dropped).toHaveLength(0);
  });

  it('drops all candidates when no entities or signals exist', () => {
    const candidates = [
      makeCandidate({
        title: 'Contact Random Name',
        content: 'Random Name asked about the project timeline.',
      }),
    ];
    const result = applyEntityRealityGate(candidates, [], []);
    expect(result.passed).toHaveLength(0);
    expect(result.dropped).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Structured author evidence — signal candidates with author field
// ---------------------------------------------------------------------------

describe('Entity Reality Gate — structured author evidence (structured > regex)', () => {
  it('passes signal candidate using author field even when name absent from body text', () => {
    // Body text has no "First Last" pattern but author field has the real sender.
    const c = makeCandidate({
      type: 'signal',
      title: 'Re: Q3 proposal followup',
      content: 'Thanks for sending that over. Let me review and get back to you.',
      author: 'Sarah Chen <sarah@example.com>',
    });
    // Sarah Chen is in KNOWN_ENTITIES — verifiedSet has "sarah chen"
    const result = applyEntityRealityGate([c], KNOWN_ENTITIES, SIGNAL_HISTORY);
    expect(result.passed).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it('passes signal candidate with plain email author (no display name)', () => {
    // Local part "sam devore" matches verified entity "sam devore"
    const c = makeCandidate({
      type: 'signal',
      title: 'Calendar: project planning',
      content: 'Block time for project planning meeting.',
      author: 'sam.devore@devore.com',
    });
    const result = applyEntityRealityGate([c], KNOWN_ENTITIES, SIGNAL_HISTORY);
    expect(result.passed).toHaveLength(1);
  });

  it('still drops signal candidate when author is unknown AND regex fails', () => {
    const c = makeCandidate({
      type: 'signal',
      title: 'check the status',
      content: 'need to review the document and update progress.',
      author: 'noreply@some-promo-service.com',
    });
    const result = applyEntityRealityGate([c], KNOWN_ENTITIES, SIGNAL_HISTORY);
    // noreply resolves to "noreply" as entity — not in verifiedSet → drop
    expect(result.dropped).toHaveLength(1);
  });

  it('uses author before regex: author entity wins when body text has a different name', () => {
    // Body contains "Unknown Stranger" (unverified) but author is Sarah Chen (verified).
    // Without the fix, regex would find "Unknown Stranger" first and drop.
    // With the fix, author "Sarah Chen" is checked first → passes.
    const c = makeCandidate({
      type: 'signal',
      title: 'Message from sender',
      content: 'Unknown Stranger mentioned this task in the thread.',
      author: 'Sarah Chen <sarah@example.com>',
    });
    const result = applyEntityRealityGate([c], KNOWN_ENTITIES, SIGNAL_HISTORY);
    expect(result.passed).toHaveLength(1);
  });

  it('falls back to regex when author is absent', () => {
    // No author field — falls back to regex and finds "Sarah Chen" in text
    const c = makeCandidate({
      type: 'signal',
      title: 'Sarah Chen sent a contract',
      content: 'Sarah Chen requested the contract by Friday.',
    });
    const result = applyEntityRealityGate([c], KNOWN_ENTITIES, SIGNAL_HISTORY);
    expect(result.passed).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('Entity Reality Gate — edge cases', () => {
  it('does not count same entity in same signal twice for 2-signal rule', () => {
    const signals: SignalRecord[] = [
      { content: 'Jane Doe said Jane Doe will handle it', source: 'gmail' },
    ];
    const c = makeCandidate({
      title: 'Talk to Jane Doe',
      content: 'Jane Doe needs to confirm the approach.',
    });
    const result = applyEntityRealityGate([c], [], signals);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].reason).toBe('single_appearance_no_email');
  });

  it('matches entity by partial name (first name in verified set)', () => {
    const c = makeCandidate({
      title: 'Email Michael about timeline',
      content: 'Michael needs the updated timeline by EOW.',
    });
    // Michael Torres is in KNOWN_ENTITIES — "michael" is in verified set
    const result = applyEntityRealityGate([c], KNOWN_ENTITIES, SIGNAL_HISTORY);
    expect(result.passed).toHaveLength(1);
  });
});
