/**
 * Hacker News scanner — finds pain signal posts via the free Firebase API.
 *
 * Completely free, no auth, no rate limit documented.
 * Scans "Ask HN" and recent stories for productivity pain keywords.
 */

import { createHash } from 'crypto';
import { scorePost, MIN_SCORE } from '../acquisition/keywords';

export interface HNPost {
  platform:      'hackernews';
  id:            string;
  author:        string;
  url:           string;
  title:         string;
  body:          string;
  subreddit:     '';           // Not applicable; kept for unified interface
  score:         number;       // Foldera relevance score
  hnPoints:      number;       // HN upvotes
  matchedLabels: string[];
  contentHash:   string;
  postedAt:      string;
}

const HN_API = 'https://hacker-news.firebaseio.com/v0';

interface HNItem {
  id:    number;
  type:  string;
  by?:   string;
  title?: string;
  text?:  string;
  url?:   string;
  score?: number;
  time?:  number;
  kids?:  number[];
}

async function fetchItem(id: number): Promise<HNItem | null> {
  try {
    const res = await fetch(`${HN_API}/item/${id}.json`, {
      headers: { 'User-Agent': 'Foldera/1.0 (signal scanner)' },
    });
    if (!res.ok) return null;
    return await res.json() as HNItem;
  } catch {
    return null;
  }
}

/**
 * Scan Hacker News for pain signal posts.
 * Checks the latest "Ask HN" stories and top/new stories.
 * Returns scored posts above MIN_SCORE.
 */
export async function scanHackerNews(): Promise<HNPost[]> {
  const results: HNPost[] = [];
  const seen = new Set<number>();

  // Fetch recent stories (top + new, first 100 of each)
  const [topRes, newRes, askRes] = await Promise.all([
    fetch(`${HN_API}/topstories.json`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${HN_API}/newstories.json`).then(r => r.ok ? r.json() : []).catch(() => []),
    fetch(`${HN_API}/askstories.json`).then(r => r.ok ? r.json() : []).catch(() => []),
  ]);

  // Prioritize Ask HN (higher signal), then new, then top
  const storyIds: number[] = [];
  const askIds = (askRes as number[]).slice(0, 30);
  const newIds = (newRes as number[]).slice(0, 30);
  const topIds = (topRes as number[]).slice(0, 20);

  for (const id of [...askIds, ...newIds, ...topIds]) {
    if (!seen.has(id)) {
      seen.add(id);
      storyIds.push(id);
    }
  }

  // Limit total to avoid excessive API calls
  const toCheck = storyIds.slice(0, 60);

  // Fetch items in batches of 10 for reasonable speed
  for (let i = 0; i < toCheck.length; i += 10) {
    const batch = toCheck.slice(i, i + 10);
    const items = await Promise.all(batch.map(id => fetchItem(id)));

    for (const item of items) {
      if (!item || item.type !== 'story') continue;
      if (!item.by || !item.title) continue;

      // Only keep posts from last 48 hours
      const postedAt = item.time ? new Date(item.time * 1000) : null;
      if (!postedAt) continue;
      const hoursSincePost = (Date.now() - postedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSincePost > 48) continue;

      // Strip HTML from text field
      const body = (item.text ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 1000);

      const { score, matchedLabels } = scorePost(item.title, body);
      if (score < MIN_SCORE) continue;

      const contentHash = createHash('sha256').update(`hackernews:${item.id}`).digest('hex');

      results.push({
        platform: 'hackernews',
        id:       String(item.id),
        author:   item.by,
        url:      `https://news.ycombinator.com/item?id=${item.id}`,
        title:    item.title,
        body,
        subreddit: '',
        score,
        hnPoints: item.score ?? 0,
        matchedLabels,
        contentHash,
        postedAt: postedAt.toISOString(),
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
