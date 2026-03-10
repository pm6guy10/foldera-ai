/**
 * Reddit scanner — finds pain signal posts via the public JSON search API.
 *
 * No auth required for read-only requests.
 * Rate limit: ~1 req/s; we stay well under by running once daily.
 */

import { createHash } from 'crypto';
import { scorePost, MIN_SCORE, TARGET_SUBREDDITS } from './keywords';

export interface SocialPost {
  platform:   'reddit';
  id:         string;         // platform-native id (e.g. Reddit post id)
  author:     string;         // username handle (no @ prefix)
  url:        string;         // Permalink to the post
  title:      string;
  body:       string;         // selftext or snippet
  subreddit:  string;
  score:      number;         // Foldera relevance score
  matchedLabels: string[];
  contentHash: string;        // SHA-256 of platform:id for deduplication
  postedAt:   string;         // ISO timestamp
}

interface RedditChild {
  kind: 't3';
  data: {
    id:           string;
    name:         string;
    title:        string;
    selftext:     string;
    author:       string;
    subreddit:    string;
    permalink:    string;
    created_utc:  number;
    score:        number;     // Reddit upvotes (not our score)
    is_self:      boolean;
  };
}

interface RedditSearchResponse {
  data: {
    children: RedditChild[];
  };
}

/**
 * Search a subreddit for posts matching Foldera pain keywords.
 * `timeWindow` = Reddit t= param: 'day' | 'week'
 */
async function searchSubreddit(
  subreddit: string,
  query: string,
  timeWindow: 'day' | 'week' = 'day',
): Promise<SocialPost[]> {
  const url =
    `https://www.reddit.com/r/${subreddit}/search.json` +
    `?q=${encodeURIComponent(query)}&sort=new&t=${timeWindow}&limit=25&restrict_sr=on`;

  const res = await fetch(url, {
    headers: {
      // Reddit requires a real User-Agent to avoid 429s
      'User-Agent': 'Foldera/1.0 (signal scanner; contact: admin@foldera.ai)',
    },
  });

  if (!res.ok) {
    // Non-fatal — skip this subreddit on error
    console.warn(`[reddit-scanner] ${subreddit}: ${res.status}`);
    return [];
  }

  const json = await res.json() as RedditSearchResponse;
  const children = json?.data?.children ?? [];

  const posts: SocialPost[] = [];

  for (const child of children) {
    if (child.kind !== 't3') continue;
    const { id, title, selftext, author, subreddit: sr, permalink, created_utc } = child.data;

    // Skip removed/deleted
    if (!title || author === '[deleted]' || author === 'AutoModerator') continue;

    const body = selftext?.slice(0, 1000) ?? '';
    const { score, matchedLabels } = scorePost(title, body);
    if (score < MIN_SCORE) continue;

    const contentHash = createHash('sha256').update(`reddit:${id}`).digest('hex');

    posts.push({
      platform: 'reddit',
      id,
      author,
      url:    `https://reddit.com${permalink}`,
      title,
      body,
      subreddit: sr,
      score,
      matchedLabels,
      contentHash,
      postedAt: new Date(created_utc * 1000).toISOString(),
    });
  }

  return posts;
}

/**
 * Scan all target subreddits for pain signal posts.
 * Returns deduplicated, scored posts above MIN_SCORE.
 */
export async function scanReddit(timeWindow: 'day' | 'week' = 'day'): Promise<SocialPost[]> {
  // Representative queries — broad enough to catch the pain, narrow enough to stay relevant
  const queries = [
    'overwhelmed email OR inbox OR follow-up OR commitments',
    'chief of staff personal assistant productivity',
    'ai assistant automation email',
  ];

  const seen = new Set<string>();
  const results: SocialPost[] = [];

  for (const subreddit of TARGET_SUBREDDITS) {
    for (const query of queries) {
      try {
        const posts = await searchSubreddit(subreddit, query, timeWindow);
        for (const post of posts) {
          if (!seen.has(post.id)) {
            seen.add(post.id);
            results.push(post);
          }
        }
        // Polite delay between requests
        await delay(600);
      } catch (err) {
        console.warn(`[reddit-scanner] ${subreddit}/${query}:`, err);
      }
    }
  }

  // Sort by Foldera relevance score descending
  return results.sort((a, b) => b.score - a.score);
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
