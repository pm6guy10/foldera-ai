/**
 * Growth signal scanner — multi-channel orchestrator.
 *
 * Calls existing reddit-scanner + twitter-scanner + new hn-scanner,
 * scores results via the acquisition scorer, deduplicates,
 * and writes top signals to tkg_signals so they compete in
 * tomorrow's conviction engine alongside personal signals.
 *
 * Signal source values:
 *   - growth_reddit
 *   - growth_twitter
 *   - growth_hackernews
 *
 * These signals match the system growth goal in tkg_goals via keyword
 * overlap ("acquire", "user", "paying", "growth", "customer", "convert").
 * The scorer assigns stakes = goal priority (5). No special cases.
 */

import { createHash } from 'crypto';
import { createServerClient } from '@/lib/db/client';
import { encrypt } from '@/lib/encryption';
import { scanReddit } from '@/lib/acquisition/reddit-scanner';
import { scanTwitter } from '@/lib/acquisition/twitter-scanner';
import { scanHackerNews } from './hn-scanner';
import { score100 } from '@/lib/acquisition/scorer';
import type { SocialPost } from '@/lib/acquisition/reddit-scanner';
import type { HNPost } from './hn-scanner';

// ---------------------------------------------------------------------------
// Unified post type for all channels
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPost = { platform: string; id: string; author: string; url: string; title: string; body: string; subreddit: string; score: number; matchedLabels: string[]; contentHash: string; postedAt: string; [key: string]: any };

interface GrowthSignal {
  source:      string;  // growth_reddit | growth_twitter | growth_hackernews
  content:     string;  // Encrypted post content for scorer context
  contentHash: string;
  occurredAt:  string;
  metadata: {
    platform:      string;
    postId:        string;
    author:        string;
    url:           string;
    title:         string;
    subreddit:     string;
    painScore:     number;
    matchedLabels: string[];
    engagement:    number;  // Reddit upvotes / HN points / Twitter likes
  };
}

// ---------------------------------------------------------------------------
// Main scanner
// ---------------------------------------------------------------------------

export interface ScanResult {
  reddit:      number;
  twitter:     number;
  hackernews:  number;
  stored:      number;
  skipped:     number;  // already in tkg_signals (deduped)
}

/**
 * Run the full multi-channel growth scan.
 * Writes top signals to tkg_signals for the specified user.
 * Returns counts per channel.
 */
export async function scanGrowthSignals(userId: string): Promise<ScanResult> {
  const supabase = createServerClient();

  // ── 1. Scan all channels in parallel ──────────────────────────────────────
  const [redditPosts, twitterPosts, hnPosts] = await Promise.all([
    scanReddit('day').catch(err => {
      console.warn('[growth-scanner] Reddit scan failed:', err instanceof Error ? err.message : err);
      return [] as SocialPost[];
    }),
    scanTwitter().catch(err => {
      console.warn('[growth-scanner] Twitter scan failed:', err instanceof Error ? err.message : err);
      return [] as Array<SocialPost & { platform: 'twitter' }>;
    }),
    scanHackerNews().catch(err => {
      console.warn('[growth-scanner] HN scan failed:', err instanceof Error ? err.message : err);
      return [] as HNPost[];
    }),
  ]);

  console.log(`[growth-scanner] Raw: ${redditPosts.length} Reddit, ${twitterPosts.length} Twitter, ${hnPosts.length} HN`);

  // ── 2. Score all posts with the 0-100 scorer ────────────────────────────────
  const scored: Array<{ post: AnyPost; painScore: number; source: string }> = [];

  for (const post of redditPosts) {
    const detail = score100(post.title, post.body);
    scored.push({ post, painScore: detail.score_100, source: 'growth_reddit' });
  }

  for (const post of twitterPosts) {
    const detail = score100(post.title, post.body);
    scored.push({ post, painScore: detail.score_100, source: 'growth_twitter' });
  }

  for (const post of hnPosts) {
    const detail = score100(post.title, post.body);
    scored.push({ post, painScore: detail.score_100, source: 'growth_hackernews' });
  }

  // Sort by pain score descending
  scored.sort((a, b) => b.painScore - a.painScore);

  // ── 3. Take top signals per channel ──────────────────────────────────────────
  // Reddit: top 5, Twitter: top 3, HN: top 2 (matching the spec)
  const limits: Record<string, number> = {
    growth_reddit: 5,
    growth_twitter: 3,
    growth_hackernews: 2,
  };
  const channelCounts: Record<string, number> = {};
  const toStore: typeof scored = [];

  for (const item of scored) {
    const count = channelCounts[item.source] ?? 0;
    const limit = limits[item.source] ?? 3;
    if (count >= limit) continue;
    // Only store posts above minimum pain threshold (40+)
    if (item.painScore < 40) continue;
    channelCounts[item.source] = count + 1;
    toStore.push(item);
  }

  // ── 4. Deduplicate against existing signals ─────────────────────────────────
  const hashes = toStore.map(s => s.post.contentHash);
  const { data: existing } = await supabase
    .from('tkg_signals')
    .select('content_hash')
    .eq('user_id', userId)
    .in('content_hash', hashes.length > 0 ? hashes : ['__none__']);

  const existingHashes = new Set((existing ?? []).map((r: { content_hash: string }) => r.content_hash));

  // ── 5. Build and store growth signals ───────────────────────────────────────
  const signals: GrowthSignal[] = [];

  for (const item of toStore) {
    if (existingHashes.has(item.post.contentHash)) continue;

    const p = item.post;
    const engagement = 'hnPoints' in p
      ? (p as HNPost).hnPoints
      : ('score' in p ? (p as any).score ?? 0 : 0);

    // Build signal content that the conviction engine scorer can match
    // against the growth goal. Includes keywords like "acquire", "user",
    // "growth", "customer" alongside the actual post content.
    const content = [
      `[Growth Signal — ${item.source.replace('growth_', '')}]`,
      `Platform: ${p.platform} | Author: ${p.author} | Pain Score: ${item.painScore}/100`,
      `URL: ${p.url}`,
      `Matched: ${p.matchedLabels.join(', ')}`,
      '',
      `Title: ${p.title}`,
      p.body ? `Body: ${p.body.slice(0, 800)}` : '',
      '',
      `This is a potential Foldera user acquisition opportunity.`,
      `Goal: acquire paying users, convert visitors, grow customer base.`,
      `Action: draft a personalized reply following GROWTH.md rules.`,
    ].filter(Boolean).join('\n');

    signals.push({
      source:      item.source,
      content:     encrypt(content),
      contentHash: p.contentHash,
      occurredAt:  p.postedAt,
      metadata: {
        platform:      p.platform,
        postId:        p.id,
        author:        p.author,
        url:           p.url,
        title:         p.title,
        subreddit:     p.subreddit ?? '',
        painScore:     item.painScore,
        matchedLabels: p.matchedLabels,
        engagement,
      },
    });
  }

  // Batch insert
  let stored = 0;
  for (const sig of signals) {
    const { error } = await supabase.from('tkg_signals').insert({
      user_id:      userId,
      source:       sig.source,
      type:         'growth_opportunity',
      content:      sig.content,
      content_hash: sig.contentHash,
      occurred_at:  sig.occurredAt,
      processed:    true,  // Ready for scorer
      metadata:     sig.metadata,
    });

    if (error) {
      if (error.code === '23505') continue; // duplicate — skip
      console.warn(`[growth-scanner] Insert failed:`, error.message);
    } else {
      stored++;
    }
  }

  const result: ScanResult = {
    reddit:     redditPosts.length,
    twitter:    twitterPosts.length,
    hackernews: hnPosts.length,
    stored,
    skipped:    toStore.length - stored,
  };

  console.log(`[growth-scanner] Result: stored=${stored}, skipped=${result.skipped}`);
  return result;
}
