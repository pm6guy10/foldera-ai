import { describe, expect, it } from 'vitest';
import { evaluateCandidateArtifactability } from '@/lib/briefing/artifact-taste-pack';
import type { ScoredLoop } from '@/lib/briefing/scorer';

/**
 * Master Audit #445 — gem-surfacing.
 *
 * The artifactability taxonomy previously hardcoded `relationship_risk_silence` to
 * tier_3 (the positive-winner contract only lets tier_1/tier_2 win) AND blocked it
 * unless the text carried a work keyword — so a "high-value relationship going silent"
 * gem could never be the surfaced card. This locks the discerning fix: a relationship
 * gem GROUNDED in a real, recent two-way thread (>=2 source facts within 14 days) is
 * promoted to tier_2 and unblocked; a vague/thin one stays tier_3 and suppressed.
 */

const NOW = new Date('2026-06-19T00:00:00Z');

function candidate(overrides: Partial<ScoredLoop>): ScoredLoop {
  return {
    id: 'rel_test',
    title: 'High-value relationship at risk: Roman',
    content: 'Roman has not replied to your last two messages; the thread has gone quiet.',
    suggestedActionType: 'write_document',
    relatedSignals: [],
    sourceSignals: [],
    ...overrides,
  } as unknown as ScoredLoop;
}

describe('gem-surfacing: relationship-silence tiering (#445)', () => {
  it('GROUNDED relationship gem (>=2 recent source facts) → tier_2, artifactable, not blocked', () => {
    const c = candidate({
      sourceSignals: [
        { summary: 'Roman asked about the partnership and you replied', source: 'gmail', occurredAt: '2026-06-14T00:00:00Z' },
        { summary: 'Roman went quiet after your reply', source: 'gmail', occurredAt: '2026-06-10T00:00:00Z' },
      ] as unknown as ScoredLoop['sourceSignals'],
    });
    const r = evaluateCandidateArtifactability(c, { now: NOW });
    expect(r.artifact_family).toBe('relationship_risk_silence');
    expect(r.tier).toBe('tier_2');
    expect(r.artifactable).toBe(true);
    expect(r.blockers).not.toContain('relationship_silence_without_command_center_artifact');
  });

  it('VAGUE relationship silence (no grounded facts) → stays tier_3, blocked, not artifactable', () => {
    const c = candidate({
      title: 'Relationship cooling: an old friend',
      content: 'You have gone quiet with them.',
      sourceSignals: [],
    });
    const r = evaluateCandidateArtifactability(c, { now: NOW });
    expect(r.artifact_family).toBe('relationship_risk_silence');
    expect(r.tier).toBe('tier_3');
    expect(r.artifactable).toBe(false);
    expect(r.blockers).toContain('relationship_silence_without_command_center_artifact');
  });

  it('STALE relationship silence (facts older than 14 days) → not promoted, stays tier_3', () => {
    const c = candidate({
      sourceSignals: [
        { summary: 'Roman asked about the partnership', source: 'gmail', occurredAt: '2026-05-01T00:00:00Z' },
        { summary: 'You replied, then it went quiet', source: 'gmail', occurredAt: '2026-04-28T00:00:00Z' },
      ] as unknown as ScoredLoop['sourceSignals'],
    });
    const r = evaluateCandidateArtifactability(c, { now: NOW });
    expect(r.tier).toBe('tier_3');
    expect(r.artifactable).toBe(false);
  });
});
