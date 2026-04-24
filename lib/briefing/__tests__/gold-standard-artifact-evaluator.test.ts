import { describe, expect, it } from 'vitest';
import { evaluateGoldStandardArtifact } from '../gold-standard-artifact-evaluator';

describe('evaluateGoldStandardArtifact', () => {
  const situation = 'Follow-up stalled with Acme AP on overdue invoices';
  const sourceFacts = [
    '3 unreplied invoices since March 29',
    'payment terms expire May 1',
  ];

  it('fails generic advice output', () => {
    const result = evaluateGoldStandardArtifact({
      situation,
      sourceFacts,
      artifactText:
        'Consider reviewing your options. Prepare a follow-up plan and review your notes before replying.',
    });

    expect(result.passes).toBe(false);
    expect(result.genericFailureReasons).toContain('generic_advice');
    expect(result.genericFailureReasons).toContain('homework_language');
  });

  it('passes and scores materially higher for a finished leverage artifact', () => {
    const generic = evaluateGoldStandardArtifact({
      situation,
      sourceFacts,
      artifactText:
        'Consider reviewing your options. Prepare a follow-up plan and review your notes before replying.',
    });

    const finished = evaluateGoldStandardArtifact({
      situation,
      sourceFacts,
      artifactText:
        'Situation: Follow-up stalled with Acme AP on overdue invoices. ' +
        'Source facts: 3 unreplied invoices since March 29 and payment terms expire May 1. ' +
        'Hidden leverage point: the bottleneck is missing owner assignment on their side. ' +
        'Final draft - send this as-is. Subject: Escalation on overdue invoices before May 1 terms expiry. ' +
        'Body: Hi Acme AP team, we still have 3 unreplied invoices since March 29, and terms expire May 1. ' +
        'Please confirm the billing owner today so we can resolve payment this week.',
    });

    expect(finished.passes).toBe(true);
    expect(finished.score).toBeGreaterThanOrEqual(80);
    expect(finished.score).toBeGreaterThan(generic.score + 25);
  });
});
