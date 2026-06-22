import { describe, it, expect } from 'vitest';
import { runHuntAnomalies } from '../hunt-anomalies';
import { huntFindingToScoredLoop } from '../scorer';
import { evaluateCandidateArtifactability } from '../artifact-taste-pack';
import type { HuntFinding } from '../hunt-anomalies';

/**
 * #516 — the daily verdict was dark because hunt candidates dropped their source
 * date. The artifactability gate reads sourceSignals[].occurredAt to decide if a
 * finding is "current"; hunt candidates set no occurredAt, so currentnessDays was
 * always null and they were blocked by missing_current_artifact_anchor /
 * stale_status_without_current_artifact_facts. These tests lock the grounding
 * fix (carry the real date through) WITHOUT loosening the gate.
 */

function mailReceived(id: string, iso: string, from: string, subject: string) {
  return {
    id,
    content: `[Email received: ${iso}]\nFrom: ${from}\nTo: me@test.com\nSubject: ${subject}\nBody preview: hello`,
    source: 'gmail' as const,
    type: 'email_received' as const,
    occurred_at: new Date(iso).toISOString(),
    author: from.match(/<([^>]+)>/)?.[1] ?? from,
  };
}

describe('#516 hunt grounding', () => {
  it('runHuntAnomalies stamps each finding with newestSignalAt = newest supporting signal date', () => {
    const base = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const iso = (hoursAgo: number) => new Date(base - hoursAgo * 60 * 60 * 1000).toISOString();
    const newest = iso(0);
    const signals = [
      mailReceived('r1', newest, 'Busy Sender <busy@corp.com>', 'Thread A'),
      mailReceived('r2', iso(10), 'Busy Sender <busy@corp.com>', 'Thread B'),
      mailReceived('r3', iso(20), 'Busy Sender <busy@corp.com>', 'Thread C'),
    ];

    const { findings } = runHuntAnomalies({ signals, commitments: [] });
    const finding = findings.find((f) => f.kind === 'repeated_ignored_sender');

    expect(finding).toBeDefined();
    expect(finding!.newestSignalAt).toBe(newest);
  });

  it('huntFindingToScoredLoop propagates newestSignalAt onto sourceSignals[].occurredAt', () => {
    const newest = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const finding: HuntFinding = {
      kind: 'unreplied_inbound',
      id: 'hunt_test_1',
      title: 'Inbound email unanswered 2 days',
      summary: 'A real inbound thread has no reply.',
      suggestedActionType: 'write_document',
      supportingSignalIds: ['s1', 's2'],
      evidenceLines: ['Thread (2026-06-20)'],
      severity: 5,
      newestSignalAt: newest,
    };

    const loop = huntFindingToScoredLoop(finding);

    expect(loop.sourceSignals.length).toBeGreaterThan(0);
    expect(loop.sourceSignals.every((s) => s.occurredAt === newest)).toBe(true);
  });

  it('the gate blocks an undated grounded candidate, ships it once dated, and still blocks genuinely stale evidence (no loosening)', () => {
    // Routes to other_grounded_artifact (no interview/calendar/admin/relationship
    // keywords, not a send_message) and carries no current-anchor keyword, so the
    // ONLY thing standing between blocked and shipped is the source date.
    const candidate = (occurredAt?: string) =>
      ({
        id: 'c1',
        type: 'hunt',
        title: 'Move the Hydra rollout forward',
        content: 'The Hydra rollout has an open thread that needs a concrete next step from you.',
        suggestedActionType: 'write_document',
        sourceSignals: [{ kind: 'signal', id: 's1', summary: 'Hydra rollout status update', occurredAt }],
      }) as any;

    const days = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

    // Before the fix: undated → blocked.
    const undated = evaluateCandidateArtifactability(candidate(undefined));
    expect(undated.blockers).toContain('missing_current_artifact_anchor');

    // After the fix: a fresh real date → no longer blocked, ships.
    const fresh = evaluateCandidateArtifactability(candidate(days(2)));
    expect(fresh.blockers).not.toContain('missing_current_artifact_anchor');
    expect(fresh.blockers).not.toContain('stale_status_without_current_artifact_facts');
    expect(fresh.artifactable).toBe(true);

    // Doctrine guard: genuinely old evidence is STILL correctly blocked.
    const stale = evaluateCandidateArtifactability(candidate(days(30)));
    expect(stale.blockers).toContain('stale_evidence_over_14d');
  });
});
