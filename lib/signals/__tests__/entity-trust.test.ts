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

  it('does NOT trust a sender on inbound volume alone', () => {
    // The legacy rule (1 interaction => trusted) is how spammers, personal
    // contacts, and Amazon returns became top work entities.
    expect(classifyEntityTrustClass('stranger@example.com', 1)).toBe('unclassified');
    expect(classifyEntityTrustClass('stranger@example.com', 50)).toBe('unclassified');
  });

  it('does NOT auto-trust .org / .gov domains', () => {
    expect(classifyEntityTrustClass('events@bigcharity.org', 5)).toBe('unclassified');
    expect(classifyEntityTrustClass('someone@agency.gov', 5)).toBe('unclassified');
  });

  it('trusts a person the user has written to (outbound evidence)', () => {
    expect(
      classifyEntityTrustClass('client@example.com', 1, { hasOutboundEvidence: true }),
    ).toBe('trusted');
  });

  it('classifies personal relationships as personal even with outbound evidence', () => {
    expect(
      classifyEntityTrustClass('krista@example.com', 12, {
        hasOutboundEvidence: true,
        relationship: 'personal',
      }),
    ).toBe('personal');
  });

  it('classifies automated senders as transactional', () => {
    expect(
      classifyEntityTrustClass('returns-dept@retailer.com', 9, { relationship: 'automated' }),
    ).toBe('transactional');
  });

  it('keeps personal sticky over trusted on merge', () => {
    // Replying to your wife's friend does not make her a work entity.
    expect(mergeTrustClass('personal', 'trusted')).toBe('personal');
    expect(mergeTrustClass('trusted', 'personal')).toBe('personal');
  });

  it('does not brand zero-interaction passive mentions as junk', () => {
    expect(classifyEntityTrustClass('mentioned@example.com', 0)).toBe('unclassified');
  });
});
