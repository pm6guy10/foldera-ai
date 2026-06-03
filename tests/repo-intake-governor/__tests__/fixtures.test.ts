import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildIntakePacket, formatIntakePacket } from '@/lib/repo-intake-governor';

const fixtureRoot = path.join(process.cwd(), 'tests/fixtures/repo-intake-governor');
const context = {
  activeIssue: 166,
  activeIssueTitle: 'Repo Intake Governor v0 - classify owner input into repo truth',
  openThreadsIssue: 165,
  ledgerIssue: 136,
};

const fixtureExpectations = [
  ['vision.md', 'VISION', 'open-thread capture', '#165', 'NO', 'NO'],
  ['audit-finding.md', 'AUDIT_FINDING', 'comment/update existing issue', '#166', 'NO', 'YES'],
  ['active-command.md', 'ACTIVE_SEAM_COMMAND', 'update active seam', '#166', 'NO', 'YES'],
  ['blocker-report.md', 'BLOCKER_REPORT', 'blocked receipt', 'PR #142', 'NO', 'NO'],
  ['business-plan-update.md', 'BUSINESS_PLAN_UPDATE', 'open-thread capture', '#165', 'NO', 'NO'],
  ['architecture-doctrine.md', 'ARCHITECTURE_DOCTRINE', 'comment/update existing issue', '#166', 'NO', 'YES'],
  ['product-proof.md', 'PRODUCT_PROOF', 'comment/update existing issue', '#166', 'NO', 'YES'],
  ['repo-hygiene.md', 'REPO_HYGIENE', 'blocked receipt', '#166', 'NO', 'NO'],
  ['lesson-learned.md', 'LESSON_LEARNED', 'open-thread capture', '#165', 'NO', 'NO'],
  ['duplicate-reference.md', 'REFERENCE_ONLY', 'reference-only receipt', '#165', 'NO', 'NO'],
  ['unsafe-expansion.md', 'UNSAFE_EXPANSION', 'blocked receipt', '#166', 'NO', 'NO'],
  ['open-thread-capture.md', 'OPEN_THREAD_CAPTURE', 'open-thread capture', '#165', 'NO', 'NO'],
] as const;

describe('Repo Intake Governor fixtures', () => {
  it.each(fixtureExpectations)(
    'routes %s through the required output contract',
    (file, classification, routingOutcome, target, newIssueNeeded, activeSeamImpact) => {
      const input = fs.readFileSync(path.join(fixtureRoot, file), 'utf8');
      const packet = buildIntakePacket(input, context);
      const formatted = formatIntakePacket(packet);

      expect(packet.classification).toBe(classification);
      expect(packet.routingOutcome).toBe(routingOutcome);
      expect(packet.existingGithubTarget).toBe(target);
      expect(packet.newIssueNeeded).toBe(newIssueNeeded);
      expect(packet.activeSeamImpact).toBe(activeSeamImpact);
      expect(packet.why.length).toBeGreaterThan(0);
      expect(packet.oneNextMove.length).toBeGreaterThan(0);
      expect(packet.forbiddenWork.length).toBeGreaterThan(0);
      expect(packet.proofRequired.length).toBeGreaterThan(0);
      expect(packet.stopCondition.length).toBeGreaterThan(0);
      for (const label of [
        'Classification:',
        'Bucket:',
        'Existing GitHub target:',
        'New issue needed:',
        'Active seam impact:',
        'Why:',
        'One next move:',
        'Forbidden work:',
        'Proof required:',
        'Stop condition:',
      ]) {
        expect(formatted).toContain(label);
      }
    },
  );

  it('never treats Open Threads as implementation authority', () => {
    const input = fs.readFileSync(path.join(fixtureRoot, 'open-thread-capture.md'), 'utf8');
    const packet = buildIntakePacket(input, context);

    expect(packet.existingGithubTarget).toBe('#165');
    expect(packet.activeSeamImpact).toBe('NO');
    expect(packet.stopCondition).toContain('capture only');
  });

  it('never recommends more than one active seam', () => {
    const input = fs.readFileSync(path.join(fixtureRoot, 'unsafe-expansion.md'), 'utf8');
    const packet = buildIntakePacket(input, context);

    expect(packet.oneNextMove).toContain('Do not start another seam');
    expect(packet.newIssueNeeded).toBe('NO');
  });
});
