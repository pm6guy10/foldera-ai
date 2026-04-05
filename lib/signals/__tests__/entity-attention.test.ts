import { describe, it, expect } from 'vitest';
import {
  applyAttentionDecay,
  ATTENTION_DECAY_PER_DAY,
  clampSalience,
  computeLivingGraphMultiplier,
  capSalienceForTrustClass,
  defaultAttention,
  mergeAttentionIntoPatterns,
  parseAttentionFromPatterns,
  reinforceAttentionState,
  resolveScoringCandidateEntityId,
  SALIENCE_MIN,
  SALIENCE_MAX,
  wholeUtcDaysBetween,
} from '../entity-attention';

describe('entity-attention', () => {
  it('clampSalience respects bounds', () => {
    expect(clampSalience(0)).toBe(SALIENCE_MIN);
    expect(clampSalience(2)).toBe(SALIENCE_MAX);
    expect(clampSalience(0.6)).toBe(0.6);
  });

  it('parseAttentionFromPatterns returns null when missing', () => {
    expect(parseAttentionFromPatterns(null)).toBeNull();
    expect(parseAttentionFromPatterns({})).toBeNull();
    expect(parseAttentionFromPatterns({ bx_stats: { x: 1 } })).toBeNull();
  });

  it('parseAttentionFromPatterns reads subkey and clamps salience', () => {
    const p = {
      bx_stats: { signal_count_14d: 1 },
      attention: {
        version: 1,
        salience: 99,
        last_reinforced_at: '2026-01-01T00:00:00.000Z',
      },
    };
    const a = parseAttentionFromPatterns(p);
    expect(a?.salience).toBe(SALIENCE_MAX);
    expect(parseAttentionFromPatterns(p)?.last_reinforced_at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('mergeAttentionIntoPatterns preserves bx_stats', () => {
    const bx = { signal_count_14d: 3, computed_at: 't' };
    const merged = mergeAttentionIntoPatterns({ bx_stats: bx }, {
      version: 1,
      salience: 0.7,
      last_reinforced_at: '2026-04-01T00:00:00.000Z',
    });
    expect(merged.bx_stats).toEqual(bx);
    expect((merged.attention as { salience: number }).salience).toBe(0.7);
  });

  it('reinforceAttentionState applies deltas and idempotency', () => {
    const t0 = '2026-04-01T12:00:00.000Z';
    const base = defaultAttention(t0);
    const r1 = reinforceAttentionState(base, 'executed', 'act-1', '2026-04-02T12:00:00.000Z');
    expect(r1.salience).toBeGreaterThan(base.salience);
    expect(r1.last_terminal_attention_action_id).toBe('act-1');
    const r2 = reinforceAttentionState(r1, 'executed', 'act-1', '2026-04-03T12:00:00.000Z');
    expect(r2.salience).toBe(r1.salience);
    const r3 = reinforceAttentionState(r1, 'skipped', 'act-2', '2026-04-03T12:00:00.000Z');
    expect(r3.salience).toBeLessThan(r1.salience);
  });

  it('applyAttentionDecay is monotonic and updates last_decay_at', () => {
    const a = {
      version: 1,
      salience: 1.0,
      last_reinforced_at: '2026-01-01T00:00:00.000Z',
    };
    const out = applyAttentionDecay(a, '2026-01-04T00:00:00.000Z');
    expect(out.salience).toBeLessThanOrEqual(1.0);
    expect(out.last_decay_at).toBe('2026-01-04T00:00:00.000Z');
    const expected = Math.pow(ATTENTION_DECAY_PER_DAY, 3);
    expect(out.salience).toBeCloseTo(expected, 5);
  });

  it('wholeUtcDaysBetween handles same-day', () => {
    expect(wholeUtcDaysBetween('2026-04-01T23:00:00.000Z', '2026-04-01T23:59:00.000Z')).toBe(0);
  });

  it('capSalienceForTrustClass caps transactional and junk', () => {
    expect(capSalienceForTrustClass(0.9, 'transactional')).toBe(0.35);
    expect(capSalienceForTrustClass(0.9, 'junk')).toBe(0.35);
    expect(capSalienceForTrustClass(0.9, 'trusted')).toBe(0.9);
  });

  it('resolveScoringCandidateEntityId matches uuid id and name', () => {
    const rows = [
      { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Pat Lee', patterns: {}, trust_class: 'trusted' },
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Other', patterns: {}, trust_class: 'trusted' },
    ];
    expect(resolveScoringCandidateEntityId(rows, { id: rows[0].id, type: 'discrepancy' })).toBe(rows[0].id);
    expect(
      resolveScoringCandidateEntityId(rows, { id: 'not-uuid', type: 'relationship', entityName: 'Pat Lee' }),
    ).toBe(rows[0].id);
  });

  it('computeLivingGraphMultiplier exempts decay/risk/avoidance discrepancies', () => {
    const rows = [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        name: 'X',
        patterns: { attention: { version: 1, salience: 0.05, last_reinforced_at: 't' } },
        trust_class: 'trusted',
      },
    ];
    const low = computeLivingGraphMultiplier(rows, {
      id: rows[0].id,
      type: 'discrepancy',
      discrepancyClass: 'decay',
    });
    expect(low.multiplier).toBe(1);
    expect(low.exempt_reason).toBe('discrepancy_silence_evidence');

    const drift = computeLivingGraphMultiplier(rows, {
      id: rows[0].id,
      type: 'discrepancy',
      discrepancyClass: 'drift',
    });
    expect(drift.multiplier).toBeLessThan(1);
    expect(drift.exempt_reason).toBeNull();
  });

  it('deterministic ordering flip: high vs low salience same entity id', () => {
    const hiRow = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Pat',
      patterns: { attention: { version: 1, salience: 1.0, last_reinforced_at: 't' } },
      trust_class: 'trusted' as const,
    };
    const loRow = { ...hiRow, patterns: { attention: { version: 1, salience: 0.05, last_reinforced_at: 't' } } };
    const cand = { id: hiRow.id, type: 'discrepancy' as const, discrepancyClass: 'drift' as const };
    const mHi = computeLivingGraphMultiplier([hiRow], cand).multiplier;
    const mLo = computeLivingGraphMultiplier([loRow], cand).multiplier;
    expect(mHi).toBeGreaterThan(mLo);
  });
});
