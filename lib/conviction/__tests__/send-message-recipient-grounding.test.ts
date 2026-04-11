import { describe, it, expect } from 'vitest';
import type { ConvictionDirective } from '@/lib/briefing/types';
import {
  getSendMessageRecipientGroundingIssues,
  getArtifactPersistenceIssues,
} from '../artifact-generator';

describe('getSendMessageRecipientGroundingIssues', () => {
  const baseDirective = (evidence: string): ConvictionDirective =>
    ({
      directive: 'Follow up on the open thread.',
      reason: 'Timing',
      action_type: 'send_message',
      confidence: 80,
      evidence: [{ type: 'signal', description: evidence }],
    }) as ConvictionDirective;

  it('fails when artifact.to never appears in directive or evidence', () => {
    const d = baseDirective(
      "Here's your latest Credit Summary (2026-04-01)\nWe accepted your check deposit(s) (2026-03-31)",
    );
    const artifact = {
      type: 'email',
      to: 'dmarcreport@microsoft.com',
      subject: 'DMARC',
      body: 'Please check reports.',
    };
    expect(getSendMessageRecipientGroundingIssues('send_message', artifact, d)).toEqual([
      'send_message artifact.to is not grounded in directive or evidence',
    ]);
    expect(getArtifactPersistenceIssues('send_message', artifact, d)).toContain(
      'send_message artifact.to is not grounded in directive or evidence',
    );
  });

  it('passes when the exact recipient appears in evidence', () => {
    const d = baseDirective('Reply to no.reply.alerts@chase.com about your account alerts.');
    const artifact = {
      type: 'email',
      to: 'no.reply.alerts@chase.com',
      subject: 'Re: alerts',
      body: 'Thanks.',
    };
    expect(getSendMessageRecipientGroundingIssues('send_message', artifact, d)).toEqual([]);
  });

  it('skips check when gmail_thread_id is set (reply path)', () => {
    const d = baseDirective('Some thread follow-up');
    const artifact = {
      type: 'email',
      to: 'anyone@example.com',
      subject: 'Re:',
      body: 'Hi',
      gmail_thread_id: 'thread-abc',
    };
    expect(getSendMessageRecipientGroundingIssues('send_message', artifact, d)).toEqual([]);
  });
});
