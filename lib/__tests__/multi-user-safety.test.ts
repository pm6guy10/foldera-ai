import { describe, expect, it, vi } from 'vitest';
import * as dbClient from '@/lib/db/client';
import { getSubscriptionStatus } from '@/lib/auth/subscription';
import * as scorer from '@/lib/briefing/scorer';
import { generateDirective } from '@/lib/briefing/generator';

/** Mirrors `fetchUserSelfNameTokens` email-local extraction (dots/hyphens, longest 3+ chars after trailing digit strip). */
function longestEmailLocalToken(local: string): string | null {
  const segments = local.split(/[.\-]+/).filter(Boolean);
  let best: string | null = null;
  let bestLen = 0;
  for (const seg of segments) {
    const alpha = seg.replace(/\d+$/, '').toLowerCase();
    if (alpha.length >= 3 && alpha.length >= bestLen) {
      if (alpha.length > bestLen) {
        bestLen = alpha.length;
        best = alpha;
      }
    }
  }
  return best;
}

const FAKE_USER_ID = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';

describe('multi-user safety', () => {
  describe('email local self-token extraction', () => {
    it('picks longest segment after stripping trailing digits', () => {
      expect(longestEmailLocalToken('b.kapp1010')).toBe('kapp');
    });

    it('uses first segment when lengths tie', () => {
      expect(longestEmailLocalToken('jane.doe')).toBe('jane');
    });

    it('returns null when no segment reaches 3+ alpha chars', () => {
      expect(longestEmailLocalToken('a.b')).toBeNull();
    });
  });

  it('getSubscriptionStatus returns none for unknown user without throwing', async () => {
    const spy = vi.spyOn(dbClient, 'createServerClient').mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    } as ReturnType<typeof dbClient.createServerClient>);

    try {
      const r = await getSubscriptionStatus(FAKE_USER_ID);
      expect(r.status).toBe('none');
      expect(r.plan).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it('scoreOpenLoops resolves for an arbitrary user id (empty dataset) without throwing', async () => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return;
    }
    await expect(scorer.scoreOpenLoops(FAKE_USER_ID)).resolves.toBeDefined();
  }, 120_000);

  it('generateDirective handles null scorer result without throwing (safe empty directive)', async () => {
    const limitResult = async () => ({ data: [] as unknown[], error: null });
    const mockClient = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: () => ({
              gte: () => ({
                order: () => ({
                  limit: limitResult,
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const dbSpy = vi.spyOn(dbClient, 'createServerClient').mockReturnValue(
      mockClient as ReturnType<typeof dbClient.createServerClient>,
    );
    const scoreSpy = vi.spyOn(scorer, 'scoreOpenLoops').mockResolvedValue(null);
    try {
      const d = await generateDirective(FAKE_USER_ID, { dryRun: true, skipSpendCap: true });
      expect(d.action_type).toBe('do_nothing');
      expect(d.reason).toContain('No ranked daily brief candidate');
    } finally {
      dbSpy.mockRestore();
      scoreSpy.mockRestore();
    }
  }, 60_000);
});
