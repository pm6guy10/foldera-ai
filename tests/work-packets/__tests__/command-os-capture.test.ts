import { describe, expect, it } from 'vitest';
import { buildIntakePacket } from '@/lib/repo-intake-governor';

const context = {
  activeIssue: 168,
  activeIssueTitle: 'Command OS v1 — automatic Open Threads capture',
  openThreadsIssue: 165,
  ledgerIssue: 136,
};

describe('Command OS v1 Open Threads capture', () => {
  it('maps raw ChatGPT/CLI capture text to a GitHub Issue #165 reference-only payload without exposing user tokens', () => {
    const userTokens = {
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    };

    const rawInput = [
      'ChatGPT/CLI raw capture:',
      'Open Threads entry for Issue #165.',
      'Route this as reference-only and do not trigger an execution loop.',
      'Keep user tokens out of the resulting payload.',
    ].join(' ');

    const packet = buildIntakePacket(rawInput, context);

    expect(packet.classification).toBe('REFERENCE_ONLY');
    expect(packet.routingOutcome).toBe('reference-only receipt');
    expect(packet.existingGithubTarget).toBe('#165');
    expect(packet.newIssueNeeded).toBe('NO');
    expect(packet.activeSeamImpact).toBe('NO');
    expect(packet.oneNextMove).toContain('Open Threads #165');
    expect(JSON.stringify(packet)).not.toContain(userTokens.accessToken);
    expect(JSON.stringify(packet)).not.toContain(userTokens.refreshToken);
    expect(packet).not.toHaveProperty('user_tokens');
  });
});
