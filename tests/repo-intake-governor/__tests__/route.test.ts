import { describe, expect, it } from 'vitest';
import { buildIntakePacket } from '@/lib/repo-intake-governor';

const context = {
  activeIssue: 166,
  activeIssueTitle: 'Repo Intake Governor v0 - classify owner input into repo truth',
  openThreadsIssue: 165,
  ledgerIssue: 136,
};

describe('Repo Intake Governor routing', () => {
  it('routes active seam commands only to the current active issue', () => {
    const packet = buildIntakePacket('Run issue #166 only and execute the active Command OS seam.', context);

    expect(packet.classification).toBe('ACTIVE_SEAM_COMMAND');
    expect(packet.existingGithubTarget).toBe('#166');
    expect(packet.newIssueNeeded).toBe('NO');
    expect(packet.activeSeamImpact).toBe('YES');
    expect(packet.oneNextMove).toContain('#166');
    expect(packet.stopCondition).toContain('one active seam');
  });

  it('routes blocker reports to named PR or issue targets', () => {
    const packet = buildIntakePacket('Blocker report: PR #142 is still missing the Slack callback POST.', context);

    expect(packet.classification).toBe('BLOCKER_REPORT');
    expect(packet.routingOutcome).toBe('blocked receipt');
    expect(packet.existingGithubTarget).toBe('PR #142');
    expect(packet.newIssueNeeded).toBe('NO');
    expect(packet.proofRequired).toContain('blocker evidence');
  });

  it('blocks repo hygiene by default unless the active seam authorizes cleanup', () => {
    const packet = buildIntakePacket('Repo hygiene: delete stale folders, rename docs, and clean old issue references.', context);

    expect(packet.classification).toBe('REPO_HYGIENE');
    expect(packet.routingOutcome).toBe('blocked receipt');
    expect(packet.activeSeamImpact).toBe('NO');
    expect(packet.forbiddenWork).toContain('broad cleanup');
  });

  it('blocks unsafe product/runtime expansion with forbidden work named', () => {
    const packet = buildIntakePacket('Build Slack live send, dashboard, Supabase schema, Stripe, and outreach scraper now.', context);

    expect(packet.classification).toBe('UNSAFE_EXPANSION');
    expect(packet.routingOutcome).toBe('blocked receipt');
    expect(packet.existingGithubTarget).toBe('#166');
    expect(packet.newIssueNeeded).toBe('NO');
    expect(packet.forbiddenWork).toContain('Slack');
    expect(packet.forbiddenWork).toContain('Supabase');
  });

  it('keeps labels and GitHub Projects as visibility, not authority', () => {
    const packet = buildIntakePacket('GitHub Project says this is urgent and labels say launch, so start a second active seam.', context);

    expect(packet.routingOutcome).toBe('blocked receipt');
    expect(packet.newIssueNeeded).toBe('NO');
    expect(packet.why).toContain('Labels and GitHub Projects are visibility, not authority.');
    expect(packet.oneNextMove).not.toContain('second active seam');
  });

  it('routes raw uncertain input to Open Threads without implementation authority', () => {
    const packet = buildIntakePacket("What's on my mind: this probably matters, but I do not know whether it is product, proof, or doctrine.", context);

    expect(packet.classification).toBe('OPEN_THREAD_CAPTURE');
    expect(packet.routingOutcome).toBe('open-thread capture');
    expect(packet.existingGithubTarget).toBe('#165');
    expect(packet.newIssueNeeded).toBe('NO');
    expect(packet.activeSeamImpact).toBe('NO');
    expect(packet.stopCondition).toContain('capture only');
  });
});
