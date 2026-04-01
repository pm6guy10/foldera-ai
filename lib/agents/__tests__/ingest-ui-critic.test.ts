import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ingestUiCriticItems } from '@/lib/agents/ingest-ui-critic';

vi.mock('@/lib/utils/api-tracker', () => ({
  trackApiCall: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/agents/cost-guard', () => ({
  hasAgentBudget: vi.fn().mockResolvedValue({ ok: true, spent: 0, cap: 0.5 }),
}));

vi.mock('@/lib/agents/draft-queue', () => ({
  insertAgentDraft: vi.fn().mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001' }),
}));

describe('ingestUiCriticItems', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid body', async () => {
    const supabase = {} as never;
    const out = await ingestUiCriticItems(supabase, { items: [] });
    expect(out.staged).toBe(0);
    expect(out.errors.length).toBeGreaterThan(0);
  });
});
