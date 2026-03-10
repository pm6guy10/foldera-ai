/**
 * Twitter/X scanner — finds pain signal tweets via the v2 search API.
 *
 * Requires TWITTER_BEARER_TOKEN environment variable.
 * Returns empty array if token is not configured (graceful degradation).
 */

import { createHash } from 'crypto';
import { scorePost, MIN_SCORE } from './keywords';

export interface SocialPost {
  platform:    'twitter';
  id:          string;
  author:      string;       // @handle without @
  url:         string;
  title:       string;       // First 80 chars of tweet text (tweets have no title)
  body:        string;       // Full tweet text
  subreddit:   '';           // Not applicable; kept for unified type
  score:       number;
  matchedLabels: string[];
  contentHash: string;
  postedAt:    string;
}

interface TweetAuthor {
  id:       string;
  username: string;
  name:     string;
}

interface Tweet {
  id:           string;
  text:         string;
  author_id:    string;
  created_at:   string;
}

interface TwitterSearchResponse {
  data?:     Tweet[];
  includes?: { users?: TweetAuthor[] };
  meta?:     { result_count: number };
}

const TWITTER_BASE = 'https://api.twitter.com/2';

// Search query: pain keywords minus obvious spam/noise
const TWITTER_QUERY =
  '(overwhelmed email OR "chief of staff" OR "personal ai agent" OR "decision fatigue" OR "inbox zero" OR "follow up emails") ' +
  'lang:en -is:retweet -is:reply -is:quote';

export async function scanTwitter(): Promise<SocialPost[]> {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) {
    console.log('[twitter-scanner] TWITTER_BEARER_TOKEN not set — skipping');
    return [];
  }

  const params = new URLSearchParams({
    query:          TWITTER_QUERY,
    max_results:    '50',
    'tweet.fields': 'created_at,author_id',
    expansions:     'author_id',
    'user.fields':  'username,name',
    start_time:     new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  });

  const res = await fetch(`${TWITTER_BASE}/tweets/search/recent?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[twitter-scanner] ${res.status}: ${body}`);
    return [];
  }

  const json = await res.json() as TwitterSearchResponse;
  const tweets  = json.data ?? [];
  const userMap = new Map<string, TweetAuthor>(
    (json.includes?.users ?? []).map(u => [u.id, u]),
  );

  const posts: SocialPost[] = [];

  for (const tweet of tweets) {
    const text   = tweet.text ?? '';
    const author = userMap.get(tweet.author_id);
    if (!author) continue;

    const { score, matchedLabels } = scorePost(text.slice(0, 80), text);
    if (score < MIN_SCORE) continue;

    const contentHash = createHash('sha256').update(`twitter:${tweet.id}`).digest('hex');

    posts.push({
      platform: 'twitter',
      id:       tweet.id,
      author:   author.username,
      url:      `https://twitter.com/${author.username}/status/${tweet.id}`,
      title:    text.slice(0, 80),
      body:     text,
      subreddit: '',
      score,
      matchedLabels,
      contentHash,
      postedAt: tweet.created_at,
    });
  }

  return posts.sort((a, b) => b.score - a.score);
}
