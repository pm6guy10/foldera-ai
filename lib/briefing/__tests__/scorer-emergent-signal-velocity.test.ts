import { beforeEach, describe, expect, it, vi } from 'vitest';

const windowMs = 6 * 60 * 60 * 1000;

function buildSpikeSignals(): Array<{ id: string; occurred_at: string; source: string; type: string }> {
  const spikeBucket = Math.floor(Date.now() / windowMs);
  const out: Array<{ id: string; occurred_at: string; source: string; type: string }> = [];
  let id = 0;
  // Ten quiet 6h buckets (2 signals each) + one spike bucket (40) so max > mean + 2σ (see scorer.ts signal_velocity).
  for (let b = 1; b <= 10; b++) {
    for (let k = 0; k < 2; k++) {
      const t = (spikeBucket - b) * windowMs + k * 60_000;
      out.push({
        id: `s-${id++}`,
        occurred_at: new Date(t).toISOString(),
        source: 'gmail',
        type: 'email',
      });
    }
  }
  for (let k = 0; k < 40; k++) {
    const t = spikeBucket * windowMs + k * 30_000;
    out.push({
      id: `s-${id++}`,
      occurred_at: new Date(t).toISOString(),
      source: 'gmail',
      type: 'email',
    });
  }
  return out;
}

let mockActions: unknown[] = [];
let mockCommitments: unknown[] = [];
let mockSignals: Array<{ id: string; occurred_at: string; source: string; type: string }> = [];

function supabaseBuilder(finalData: unknown) {
  const builder: Record<string, () => unknown> = {};
  const self = () => builder;
  for (const m of ['select', 'eq', 'in', 'is', 'gte', 'order']) {
    builder[m] = self;
  }
  builder.limit = () => Promise.resolve({ data: finalData, error: null });
  return builder;
}

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from(table: string) {
      if (table === 'tkg_actions') return supabaseBuilder(mockActions);
      if (table === 'tkg_commitments') return supabaseBuilder(mockCommitments);
      if (table === 'tkg_signals') return supabaseBuilder(mockSignals);
      return supabaseBuilder([]);
    },
  }),
}));

vi.mock('@/lib/utils/structured-logger', () => ({
  logStructuredEvent: () => {},
}));

describe('detectEmergentPatterns — signal_velocity spike', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockActions = [
      { id: 'a1', directive_text: 'x', action_type: 'do_nothing', status: 'skipped', generated_at: new Date().toISOString() },
      { id: 'a2', directive_text: 'y', action_type: 'do_nothing', status: 'skipped', generated_at: new Date().toISOString() },
      { id: 'a3', directive_text: 'z', action_type: 'do_nothing', status: 'skipped', generated_at: new Date().toISOString() },
    ];
    mockCommitments = [];
    mockSignals = buildSpikeSignals();
  });

  it('uses make_decision for signal spike (not research)', async () => {
    const { detectEmergentPatterns } = await import('../scorer');
    const patterns = await detectEmergentPatterns('11111111-1111-1111-1111-111111111111');
    const velocity = patterns.filter(p => p.type === 'signal_velocity');
    expect(velocity.length).toBeGreaterThan(0);
    expect(velocity[0].suggestedActionType).toBe('make_decision');
  });
});
