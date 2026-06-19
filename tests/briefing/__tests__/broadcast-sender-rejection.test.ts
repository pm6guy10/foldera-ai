import { describe, expect, it } from 'vitest';
import { getEntityRejectionReasons } from '@/lib/briefing/discrepancy-detector';

/**
 * Master Audit #445 — noise suppression at the entity admission gate.
 *
 * A relationship gem requires a real two-way human relationship. Automated /
 * broadcast / recruiting-platform senders are the 95% noise the guardian must
 * suppress (Bible Part II-C). This locks the fix that catches the live miss:
 * "roman@expert.micro1.ai" — an AI-recruiting platform sender (with "(via Google
 * Sheets)" automation) — was wrongly surfaced as a "High-value relationship at risk".
 *
 * Fails safe: these assertions only require that broadcast senders ARE rejected and
 * real humans are NOT rejected for THIS reason (other admission reasons may still apply).
 */

type Entity = Parameters<typeof getEntityRejectionReasons>[0];

function entity(over: Partial<Entity>): Entity {
  return {
    id: 'e1',
    name: 'Roman Mansur',
    last_interaction: '2026-03-29T00:00:00Z',
    total_interactions: 45,
    patterns: { bx_stats: { signal_count_90d: 20 } },
    ...over,
  } as unknown as Entity;
}

const REASON = 'transactional_or_broadcast_sender';

describe('entity admission: broadcast/recruiting senders are rejected (#445)', () => {
  it('rejects a recruiting-platform email (roman@expert.micro1.ai)', () => {
    const r = getEntityRejectionReasons(entity({ primary_email: 'roman@expert.micro1.ai' }), [], []);
    expect(r).toContain(REASON);
  });

  it('rejects an entity already classified transactional/junk', () => {
    expect(getEntityRejectionReasons(entity({ trust_class: 'transactional', primary_email: 'x@acme.com' }), [], [])).toContain(REASON);
    expect(getEntityRejectionReasons(entity({ trust_class: 'junk', primary_email: 'x@acme.com' }), [], [])).toContain(REASON);
  });

  it('rejects a "(via <platform>)" automation display name', () => {
    expect(getEntityRejectionReasons(entity({ name: 'Roman Mansur (via Google Sheets)', primary_email: 'roman@acme.com' }), [], [])).toContain(REASON);
  });

  it('rejects no-reply / jobs / notifications local-parts', () => {
    expect(getEntityRejectionReasons(entity({ primary_email: 'no-reply@bigco.com' }), [], [])).toContain(REASON);
    expect(getEntityRejectionReasons(entity({ primary_email: 'jobs@startup.io' }), [], [])).toContain(REASON);
    expect(getEntityRejectionReasons(entity({ primary_email: 'notifications@app.com' }), [], [])).toContain(REASON);
  });

  it('does NOT reject a real person on a normal mailbox for this reason', () => {
    expect(getEntityRejectionReasons(entity({ name: 'Sarah Chen', primary_email: 'sarah.chen@gmail.com', trust_class: 'personal' }), [], [])).not.toContain(REASON);
    expect(getEntityRejectionReasons(entity({ name: 'David Okafor', primary_email: 'david@okaforlaw.com' }), [], [])).not.toContain(REASON);
  });
});
