import { describe, expect, it, vi } from 'vitest';
import * as dbClient from '@/lib/db/client';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { getSubscriptionStatus } from '@/lib/auth/subscription';
import { filterDailyBriefEligibleUserIds } from '@/lib/auth/daily-brief-users';
import * as userTokens from '@/lib/auth/user-tokens';
import * as scorer from '@/lib/briefing/scorer';
import { SCORER_STATIC_DUPLICATE_STOPWORDS } from '@/lib/briefing/scorer';
import {
  buildUserIdentityContext,
  buildPromptFromStructuredContext,
  generateDirective,
  type StructuredContext,
} from '@/lib/briefing/generator';

/** Mirrors email-local extraction used for display-name fallback. */
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
const RANDOM_UUID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

const COMMON_FIRST_NAMES = [
  'brandon',
  'sarah',
  'michael',
  'jennifer',
  'david',
  'ashley',
  'james',
  'nicole',
];

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

  it('getSubscriptionStatus with OWNER_USER_ID returns active from a real pro row shape (no code bypass)', async () => {
    const spy = vi.spyOn(dbClient, 'createServerClient').mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                plan: 'pro',
                status: 'active',
                current_period_end: new Date(Date.now() + 30 * 864e5).toISOString(),
                stripe_customer_id: 'cus_test',
              },
              error: null,
            }),
          }),
        }),
      }),
    } as ReturnType<typeof dbClient.createServerClient>);
    try {
      const r = await getSubscriptionStatus(OWNER_USER_ID);
      expect(r.status).toBe('active');
      expect(r.plan).toBe('pro');
    } finally {
      spy.mockRestore();
    }
  });

  it('filterDailyBriefEligibleUserIds: owner with active subscription passes; random uuid without sub and not connected is excluded', async () => {
    const fromSpy = vi.spyOn(dbClient, 'createServerClient').mockReturnValue({
      from: (table: string) => {
        if (table === 'user_subscriptions') {
          return {
            select: () => ({
              in: () =>
                Promise.resolve({
                  data: [{ user_id: OWNER_USER_ID, plan: 'pro', status: 'active' }],
                  error: null,
                }),
            }),
          };
        }
        return {
          select: () => ({
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      },
    } as unknown as ReturnType<typeof dbClient.createServerClient>);
    const listSpy = vi
      .spyOn(userTokens, 'listConnectedUserIds')
      .mockResolvedValue(new Set([OWNER_USER_ID]));
    try {
      const out = await filterDailyBriefEligibleUserIds([OWNER_USER_ID, RANDOM_UUID]);
      expect(out).toEqual([OWNER_USER_ID]);
    } finally {
      fromSpy.mockRestore();
      listSpy.mockRestore();
    }
  });

  it('buildUserIdentityContext with empty goals returns null', () => {
    expect(buildUserIdentityContext([])).toBeNull();
  });

  it('SCORER_STATIC_DUPLICATE_STOPWORDS has no hardcoded personal first names', () => {
    for (const name of COMMON_FIRST_NAMES) {
      expect(SCORER_STATIC_DUPLICATE_STOPWORDS.has(name)).toBe(false);
    }
  });

  it('buildPromptFromStructuredContext send path avoids hardcoded legacy account names for generic user', () => {
    const ctx = {
      has_real_recipient: true,
      recipient_brief: 'Alex Person <alex@example.com>',
      supporting_signals: [],
      already_sent_14d: [],
      recent_action_history_7d: [],
      confidence_prior: 75,
      user_full_name: 'the user',
      user_first_name: '',
    } as unknown as StructuredContext;
    const prompt = buildPromptFromStructuredContext(ctx);
    expect(prompt).not.toMatch(/Brandon/i);
    expect(prompt).not.toMatch(/Cheryl/i);
    expect(prompt).toContain('the user');
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
