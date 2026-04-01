import { describe, it, expect } from 'vitest';
import type Stripe from 'stripe';
import {
  periodEndIsoFromInvoice,
  periodEndIsoFromSubscription,
  subscriptionStatusToDb,
} from '../subscription-db';

describe('subscription-db', () => {
  it('periodEndIsoFromInvoice uses period_end', () => {
    const inv = { period_end: 1_700_000_000, lines: { data: [] } } as unknown as Stripe.Invoice;
    expect(periodEndIsoFromInvoice(inv)).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });

  it('periodEndIsoFromSubscription uses current_period_end', () => {
    const sub = { current_period_end: 1_700_000_000 } as Stripe.Subscription;
    expect(periodEndIsoFromSubscription(sub)).toBe(new Date(1_700_000_000 * 1000).toISOString());
  });

  it('subscriptionStatusToDb maps known statuses', () => {
    expect(subscriptionStatusToDb('active')).toBe('active');
    expect(subscriptionStatusToDb('trialing')).toBe('active');
    expect(subscriptionStatusToDb('past_due')).toBe('past_due');
    expect(subscriptionStatusToDb('canceled')).toBe('cancelled');
  });
});
