import { describe, expect, it } from 'vitest';

import {
  classifyEntityTrustClass,
  detectSystemSenderReason,
  mergeTrustClass,
} from '../entity-trust';

describe('entity trust classification', () => {
  it('downgrades known system sender domains even when they have interactions', () => {
    expect(classifyEntityTrustClass('onboarding@resend.dev', 20)).toBe('transactional');
    expect(classifyEntityTrustClass('jobs@wellfound.com', 4)).toBe('transactional');
    expect(classifyEntityTrustClass('team@cursor.com', 3)).toBe('transactional');
  });

  it('detects self aliases when provided explicitly', () => {
    expect(detectSystemSenderReason({
      email: 'brandon@example.com',
      selfEmails: ['brandon@example.com'],
    })).toBe('self_alias');
  });

  it('does not let trusted override transactional evidence', () => {
    expect(mergeTrustClass('trusted', 'transactional')).toBe('transactional');
    expect(mergeTrustClass('transactional', 'trusted')).toBe('transactional');
  });
});
