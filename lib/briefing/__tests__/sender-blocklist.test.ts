import { describe, it, expect } from 'vitest';
import { isBlockedSender } from '@/lib/signals/sender-blocklist';

describe('isBlockedSender', () => {
  // --- Marketing / automated senders that must be blocked ---

  it('blocks a Bass Pro marketing address', () => {
    expect(isBlockedSender('noreply@marketing.basspro.com')).toBe(true);
    expect(isBlockedSender('Bass Pro Shops <noreply@email.basspro.com>')).toBe(true);
  });

  it('blocks a Nespresso marketing address', () => {
    expect(isBlockedSender('Nespresso <newsletter@email.nespresso.com>')).toBe(true);
    expect(isBlockedSender('offers@email.nespresso.com')).toBe(true);
  });

  it('blocks generic noreply prefixes on any domain', () => {
    expect(isBlockedSender('noreply@somedomain.com')).toBe(true);
    expect(isBlockedSender('no-reply@example.org')).toBe(true);
    expect(isBlockedSender('donotreply@acmecorp.io')).toBe(true);
    expect(isBlockedSender('auto-confirm@shopify.com')).toBe(true);
  });

  it('blocks LinkedIn automated notification wrappers', () => {
    expect(isBlockedSender('jobs-noreply@linkedin.com')).toBe(true);
    expect(isBlockedSender('groups-noreply@linkedin.com')).toBe(true);
    expect(isBlockedSender('messages-noreply@linkedin.com')).toBe(true);
  });

  it('blocks noreply@governmentjobs.com', () => {
    expect(isBlockedSender('noreply@governmentjobs.com')).toBe(true);
    expect(isBlockedSender('GovernmentJobs <noreply@governmentjobs.com>')).toBe(true);
  });

  it('blocks Foldera self-referential senders', () => {
    expect(isBlockedSender('brief@foldera.ai')).toBe(true);
    expect(isBlockedSender('onboarding@resend.dev')).toBe(true);
  });

  it('blocks Facebook/Meta automated notifications', () => {
    expect(isBlockedSender('notification@facebookmail.com')).toBe(true);
    expect(isBlockedSender('Facebook <update@facebookmail.com>')).toBe(true);
  });

  it('blocks Amazon automated order/shipment senders', () => {
    expect(isBlockedSender('order-update@amazon.com')).toBe(true);
    expect(isBlockedSender('shipment-tracking@amazon.com')).toBe(true);
    expect(isBlockedSender('auto-confirm@amazon.com')).toBe(true);
    expect(isBlockedSender('ship-confirm@amazon.com')).toBe(true);
  });

  it('blocks newsletter/marketing role addresses', () => {
    expect(isBlockedSender('newsletter@company.com')).toBe(true);
    expect(isBlockedSender('marketing@brand.co')).toBe(true);
    expect(isBlockedSender('promotions@store.com')).toBe(true);
  });

  // --- Real human senders that must NOT be blocked ---

  it('does not block a real person email (yadira.clapper@hca.wa.gov)', () => {
    expect(isBlockedSender('yadira.clapper@hca.wa.gov')).toBe(false);
  });

  it('does not block a real LinkedIn personal address', () => {
    // Only the noreply wrappers are blocked — a real person's linkedin.com
    // address (if they send from it) should pass through.
    expect(isBlockedSender('holly.smith@linkedin.com')).toBe(false);
  });

  it('does not block a real Amazon customer service or account email', () => {
    // A human CS rep or account-services email that doesn't match the
    // blocked automated prefixes must pass through.
    expect(isBlockedSender('cs-reply@amazon.com')).toBe(false);
    expect(isBlockedSender('account-services@amazon.com')).toBe(false);
  });

  it('does not block a governmentjobs.com recruiter address', () => {
    // Only noreply@governmentjobs.com is blocked. Recruiter emails pass.
    expect(isBlockedSender('recruiter@governmentjobs.com')).toBe(false);
    expect(isBlockedSender('hiring@governmentjobs.com')).toBe(false);
  });

  it('does not block a null or empty author', () => {
    expect(isBlockedSender(null)).toBe(false);
    expect(isBlockedSender(undefined)).toBe(false);
    expect(isBlockedSender('')).toBe(false);
  });

  it('does not block an ordinary person email at a common domain', () => {
    expect(isBlockedSender('john.doe@gmail.com')).toBe(false);
    expect(isBlockedSender('Teo Espinoza <teo@company.com>')).toBe(false);
    expect(isBlockedSender('Holly Margulis <holly@hca.wa.gov>')).toBe(false);
  });
});
