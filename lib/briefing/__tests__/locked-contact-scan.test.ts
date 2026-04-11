import { describe, expect, it } from 'vitest';
import {
  findLockedContactsInUserFacingPayload,
  sanitizeConvictionPayloadLockedContactsInPlace,
  sanitizeStringForLockedContactDisplayNames,
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

describe('sanitizeStringForLockedContactDisplayNames', () => {
  it('replaces multi-word locked display names', () => {
    const s = sanitizeStringForLockedContactDisplayNames(
      'deadline across 4 contacts: nicole vreeland, michael',
      ['Nicole Vreeland'],
    );
    expect(s.toLowerCase()).not.toContain('nicole');
    expect(s.toLowerCase()).not.toContain('vreeland');
    expect(s).toContain('michael');
  });

  it('replaces Cheryl Anderson without touching unrelated text', () => {
    const s = sanitizeStringForLockedContactDisplayNames(
      'Fading connection: Cheryl Anderson vs other work',
      ['Cheryl Anderson'],
    );
    expect(s).not.toMatch(/cheryl/i);
    expect(s).not.toMatch(/anderson/i);
    expect(s.toLowerCase()).toContain('other work');
  });
});

describe('sanitizeConvictionPayloadLockedContactsInPlace', () => {
  it('clears locked_contact_in_artifact violations on directive + email artifact', () => {
    const payload = {
      directive: 'Follow up with Nicole Vreeland about the deadline.',
      artifact: {
        type: 'email',
        to: 'ops@example.com',
        subject: 'Nicole Vreeland — deadline',
        body: 'Hi — Nicole Vreeland asked about April.',
      },
    };
    const changed = sanitizeConvictionPayloadLockedContactsInPlace(payload, ['Nicole Vreeland']);
    expect(changed).toBe(true);
    expect(
      findLockedContactsInUserFacingPayload(
        ['Nicole Vreeland'],
        payload.directive.toLowerCase(),
        payload.artifact,
      ),
    ).toEqual([]);
  });

  it('returns false when nothing matches', () => {
    const payload = {
      directive: 'Pay the utility bill today.',
      artifact: { type: 'email', body: 'Reminder only.' },
    };
    expect(sanitizeConvictionPayloadLockedContactsInPlace(payload, ['Nicole Vreeland'])).toBe(false);
  });
});
