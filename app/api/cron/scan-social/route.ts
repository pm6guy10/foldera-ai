/**
 * GET /api/cron/scan-social
 *
 * Daily (8 AM) — scans Reddit and Twitter/X for posts matching Foldera pain
 * keywords, deduplicates against tkg_signals, then creates a draft outreach
 * proposal (via tkg_actions status='draft') for each new high-signal post.
 *
 * Brandon reviews and approves outreach in the DraftQueue on the dashboard.
 * Nothing is sent without his explicit one-tap approval.
 *
 * Auth: CRON_SECRET Bearer token.
 */

import { NextResponse }           from 'next/server';
import { createClient }           from '@supabase/supabase-js';
import { createHash }             from 'crypto';
import { scanReddit }             from '@/lib/acquisition/reddit-scanner';
import { scanTwitter }            from '@/lib/acquisition/twitter-scanner';
import type { SocialPost as RedditPost } from '@/lib/acquisition/reddit-scanner';
import type { SocialPost as TwitterPost } from '@/lib/acquisition/twitter-scanner';

export const dynamic     = 'force-dynamic';
export const maxDuration = 300;

type AnyPost = RedditPost | TwitterPost;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ---------------------------------------------------------------------------
// Outreach draft templates — personalised but not spammy
// ---------------------------------------------------------------------------

function buildOutreachBody(post: AnyPost, matchedLabels: string[]): string {
  const painLabel = matchedLabels[0] ?? 'productivity challenges';
  const platform  = post.platform === 'reddit'
    ? `r/${(post as RedditPost).subreddit}`
    : 'Twitter';

  return (
    `Hey ${post.author},\n\n` +
    `I came across your post on ${platform} about ${painLabel} and it resonated — ` +
    `this is exactly the problem I'm building Foldera to solve.\n\n` +
    `Foldera is an AI that acts as your personal chief of staff: it reads your emails ` +
    `and conversations overnight, identifies what needs to happen, and surfaces one clear ` +
    `action each morning for your approval. You tap yes or no — it does the rest.\n\n` +
    `Happy to show you what it looks like. No pitch, just a quick demo.\n\n` +
    `— Brandon\n\n` +
    `P.S. Your post: ${post.url}`
  );
}

// ---------------------------------------------------------------------------
// Main cron handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader.replace('Bearer ', '') !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = process.env.INGEST_USER_ID;
  if (!userId) {
    return NextResponse.json({ error: 'INGEST_USER_ID not configured' }, { status: 500 });
  }

  const supabase = getSupabase();
  const log: string[] = [];
  let newDrafts = 0;

  // ── Scan both platforms ─────────────────────────────────────────────────────
  const [redditPosts, twitterPosts] = await Promise.all([
    scanReddit('day').catch(err => {
      log.push(`reddit error: ${err.message}`);
      return [] as RedditPost[];
    }),
    scanTwitter().catch(err => {
      log.push(`twitter error: ${err.message}`);
      return [] as TwitterPost[];
    }),
  ]);

  log.push(`reddit: ${redditPosts.length} scored posts`);
  log.push(`twitter: ${twitterPosts.length} scored posts`);

  const allPosts: AnyPost[] = [...redditPosts, ...twitterPosts];

  // ── Process each post ───────────────────────────────────────────────────────
  for (const post of allPosts) {
    try {
      // Deduplicate: check if we've already seen this post
      const { data: existing } = await supabase
        .from('tkg_signals')
        .select('id')
        .eq('user_id', userId)
        .eq('content_hash', post.contentHash)
        .maybeSingle();

      if (existing) continue; // already processed

      // Record in tkg_signals for dedup tracking (source: social_scan)
      const contentText = `${post.platform}:${post.id} | ${post.title}\n${post.body}`;
      const signalHash  = createHash('sha256').update(contentText).digest('hex');

      await supabase.from('tkg_signals').insert({
        user_id:      userId,
        source:       'social_scan',
        source_id:    `${post.platform}:${post.id}`,
        type:         'social_post',
        content:      contentText,
        content_hash: post.contentHash,
        author:       post.author,
        recipients:   [],
        occurred_at:  post.postedAt,
        processed:    true,
      });

      // Draft outreach proposal → stored as tkg_actions status='draft'
      const body    = buildOutreachBody(post, post.matchedLabels);
      const subject = `Re: ${post.title.slice(0, 80)}`;
      const title   = `Outreach to @${post.author} on ${post.platform} (${post.matchedLabels[0] ?? 'pain signal'})`;

      await supabase.from('tkg_actions').insert({
        user_id:        userId,
        directive_text: `Foldera found a pain signal post and drafted outreach to @${post.author}`,
        action_type:    'send_message',
        confidence:     0,
        reason:         title,
        evidence:       [{
          type:        'signal',
          description: `${post.platform} post by @${post.author}: "${post.title.slice(0, 100)}"`,
          date:        post.postedAt,
        }],
        status:         'draft',
        generated_at:   new Date().toISOString(),
        execution_result: {
          draft_type:  'social_outreach',
          platform:    post.platform,
          to:          `@${post.author} (${post.platform})`,
          subject,
          body,
          post_url:    post.url,
          score:       post.score,
          matched:     post.matchedLabels,
          _title:      title,
          _source:     'scan-social',
        },
      });

      newDrafts++;
      log.push(`drafted: @${post.author} on ${post.platform} (score ${post.score})`);
    } catch (err: any) {
      log.push(`error processing ${post.platform}:${post.id}: ${err.message}`);
    }
  }

  console.log('[scan-social]', log.join(' | '));

  return NextResponse.json({
    ok:        true,
    scanned:   allPosts.length,
    newDrafts,
    log,
  });
}
