import type { SupabaseClient } from '@supabase/supabase-js';
import { insertAgentDraft } from '@/lib/agents/draft-queue';
import { runAgentSonnet } from '@/lib/agents/anthropic-runner';
import { buildSkipAvoidanceBlock } from '@/lib/agents/skip-patterns';

const SUBS = ['productivity', 'ADHD', 'Entrepreneur', 'startups', 'SaaS'] as const;

const PAIN = [
  "can't decide",
  'spinning on',
  'overwhelmed by email',
  'too many tasks',
  "don't know what to prioritize",
  'second guessing',
  'executive function',
];

interface RedditPost {
  sub: string;
  id: string;
  title: string;
  selftext: string;
  createdUtc: number;
  numComments: number;
  permalink: string;
  score: number;
}

function matchesPain(text: string): boolean {
  const t = text.toLowerCase();
  return PAIN.some((p) => t.includes(p.toLowerCase()));
}

async function fetchSubNew(sub: string): Promise<RedditPost[]> {
  const url = `https://www.reddit.com/r/${sub}/new.json?limit=40`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'FolderaGTM/1.0 (contact: support@foldera.ai)',
      },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: { children?: Array<{ data: Record<string, unknown> }> };
    };
    const children = json.data?.children ?? [];
    return children
      .map((c) => {
        const d = c.data;
        const title = String(d.title ?? '');
        const selftext = String(d.selftext ?? '');
        const created = Number(d.created_utc ?? 0);
        return {
          sub,
          id: String(d.id ?? ''),
          title,
          selftext,
          createdUtc: created,
          numComments: Number(d.num_comments ?? 0),
          permalink: String(d.permalink ?? ''),
          score: Number(d.score ?? 0),
        };
      })
      .filter((p) => matchesPain(`${p.title} ${p.selftext}`));
  } catch {
    return [];
  }
}

function scorePost(p: RedditPost, now: number): number {
  const ageHours = (now - p.createdUtc) / 3600;
  const recency = ageHours < 6 ? 1.2 : ageHours < 24 ? 1 : 0.7;
  const engagement = p.numComments > 5 ? 1.15 : p.numComments > 0 ? 1 : 0.85;
  const intensity = Math.min(1.5, 1 + Math.min(p.title.length + p.selftext.length, 800) / 2000);
  return recency * engagement * intensity * (1 + Math.min(p.score, 50) / 100);
}

export async function runGtmStrategistAgent(supabase: SupabaseClient): Promise<{
  staged: number;
  summary: string;
}> {
  const avoid = await buildSkipAvoidanceBlock(supabase, 'gtm_strategist');
  const now = Date.now() / 1000;
  const pool: RedditPost[] = [];

  for (const sub of SUBS) {
    const rows = await fetchSubNew(sub);
    pool.push(...rows);
  }

  pool.sort((a, b) => scorePost(b, now) - scorePost(a, now));
  const top = pool.slice(0, 8);
  if (top.length === 0) {
    return { staged: 0, summary: 'no matching reddit threads' };
  }

  const ctx = top
    .map(
      (p, i) =>
        `###${i + 1}. r/${p.sub} — ${p.title}\nPermalink: https://reddit.com${p.permalink}\nComments: ${p.numComments}\nBody: ${p.selftext.slice(0, 1200)}`,
    )
    .join('\n\n');

  const sonnet = await runAgentSonnet({
    job: 'gtm_strategist',
    system: [
      'You help draft genuine Reddit replies for a founder building Foldera (an AI that reads email overnight and surfaces one finished morning action).',
      'Rules: helpful first, no spam, no hard sell, mention Foldera only if it fits naturally once.',
      'Output JSON array with up to 3 objects: { "permalink": "...", "reply_markdown": "..." } only.',
      avoid,
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: `Pick the top 3 threads by helpful-fit from this list and write replies.\n\n${ctx}`,
      },
    ],
  });

  if ('error' in sonnet) {
    return { staged: 0, summary: `sonnet error: ${sonnet.error}` };
  }

  let items: Array<{ permalink?: string; reply_markdown?: string }> = [];
  try {
    const raw = sonnet.text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    items = JSON.parse(raw) as typeof items;
  } catch {
    return { staged: 0, summary: 'failed to parse sonnet JSON' };
  }

  let staged = 0;
  for (let i = 0; i < Math.min(3, items.length); i++) {
    const it = items[i];
    const body = String(it.reply_markdown ?? '').trim();
    const link = String(it.permalink ?? '').trim();
    if (!body) continue;

    const ins = await insertAgentDraft(supabase, 'gtm_strategist', {
      title: `Reddit reply draft ${i + 1}`,
      directiveLine: `Draft Reddit reply${link ? ` for ${link}` : ''}`,
      body: ['Target:', link, '', body].join('\n'),
      fixPrompt: [
        'Review the drafted Reddit reply for tone and helpfulness.',
        'Ensure it follows subreddit norms and does not read promotional.',
        'If good, post manually from your Reddit account.',
        '',
        'Reply body:',
        body,
      ].join('\n'),
      extraExecutionFields: { permalink: link || null },
    });
    if (!('error' in ins)) staged++;
  }

  return { staged, summary: `staged ${staged} draft(s)` };
}
