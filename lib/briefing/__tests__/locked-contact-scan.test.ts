import { describe, expect, it } from 'vitest';
import {
  findLockedContactsInUserFacingPayload,
  userFacingArtifactTextForLockedScan,
} from '../locked-contact-scan';

describe('userFacingArtifactTextForLockedScan', () => {
  it('collects email to/subject/body only', () => {
    const t = userFacingArtifactTextForLockedScan({
      type: 'email',
      to: 'Nicole Vreeland <n@example.com>',
      subject: 'Hello',
      body: 'Thanks',
      internal_note: 'IGNORE_ME_NICOLE_VREELAND',
    });
    expect(t).toContain('nicole');
    expect(t).toContain('thanks');
    expect(t).not.toContain('ignore_me');
  });

  it('falls back to JSON for unknown artifact type', () => {
    const t = userFacingArtifactTextForLockedScan({ type: 'unknown', x: 'Nicole' });
    expect(t).toContain('nicole');
  });
});

describe('findLockedContactsInUserFacingPayload', () => {
  it('does not flag locked name only inside JSON metadata keys', () => {
    const v = findLockedContactsInUserFacingPayload(
      ['Nicole Vreeland'],
      'follow up on the vendor contract',
      {
        type: 'email',
        to: 'legal@vendor.com',
        subject: 'Contract',
        body: 'Please send the signed copy.',
        meta_locked_name_key: 'Nicole Vreeland',
      },
    );
    expect(v).toEqual([]);
  });

  it('flags when both tokens appear in user-facing fields', () => {
    const v = findLockedContactsInUserFacingPayload(
      ['Nicole Vreeland'],
      'quick note',
      {
        type: 'email',
        to: 'Nicole Vreeland <n@example.com>',
        subject: 'Hi',
        body: 'Ping',
      },
    );
    expect(v).toEqual(['Nicole Vreeland']);
  });

  it('uses word boundaries so substrings do not match', () => {
    const v = findLockedContactsInUserFacingPayload(
      ['Nicole'],
      'unicole is a different word',
      { type: 'email', body: 'ok' },
    );
    expect(v).toEqual([]);
  });
});
