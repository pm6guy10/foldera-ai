/**
 * GET /api/cron/scan-social
 *
 * Daily (8 AM) — scans Reddit + Twitter/X for pain signal posts, scores each
 * post 0-100, and surfaces only 70+ posts as Claude-personalized outreach drafts
 * in DraftQueue. Nothing is sent without Brandon's explicit one-tap approval.
 *
 * Scoring breakdown:
 *   Keyword density     (0-60): GROWTH.md keyword groups, normalized
 *   ICP fit             (0-25): founder/exec/ADHD language
 *   Emotional intensity (0-15): urgency and frustration signals
 *
 * Each qualifying post gets a unique Claude-drafted opening that references
 * something specific from what they said — never a template.
 *
 * Auth: CRON_SECRET Bearer token.
 */

import { NextResponse }                             from 'next/server';
import { createClient }                             from '@supabase/supabase-js';
import { scanReddit }                               from '@/lib/acquisition/reddit-scanner';
import { scanTwitter }                              from '@/lib/acquisition/twitter-scanner';
import { score100, meetsThreshold }                 from '@/lib/acquisition/scorer';
import { draftPersonalizedOutreach, fallbackDraft } from '@/lib/acquisition/outreach-drafter';
import { loadCurrentWeights }                       from '@/lib/acquisition/learning-loop';
import type { SocialPost as RedditPost }            from '@/lib/acquisition/reddit-scanner';
import type { SocialPost as TwitterPost }           from '@/lib/acquisition/twitter-scanner';

export const dynamic     = 'force-dynamic';
export const maxDuration = 300;

type AnyPost = RedditPost | TwitterPost;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = process.env.INGEST_USER_ID;
  if (!userId) {
    return NextResponse.json({ error: 'INGEST_USER_ID not configured' }, { status: 500 });
  }

  const supabase      = getSupabase();
  const log: string[] = [];
  let scanned         = 0;
  let passed70        = 0;
  let newDrafts       = 0;
  let skippedDupe     = 0;

  // Load current learned weights (defaults if no model trained yet)
  const weights = await loadCurrentWeights(userId);
  log.push(`model v${weights.version} loaded`);

  // ── Scan both platforms in parallel ────────────────────────────────────────
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

  log.push(`reddit: ${redditPosts.length} pre-filtered | twitter: ${twitterPosts.length} pre-filtered`);

  const allPosts: AnyPost[] = [...redditPosts, ...twitterPosts];
  scanned = allPosts.length;

  // ── Process each post ──────────────────────────────────────────────────────
  for (const post of allPosts) {
    try {
      // Deduplicate: skip if we have already seen this post
      const { data: existing } = await supabase
        .from('tkg_signals')
        .select('id')
        .eq('user_id', userId)
        .eq('content_hash', post.contentHash)
        .maybeSingle();

      if (existing) {
        skippedDupe++;
        continue;
      }

      // Apply 0-100 scoring with current learned weights
      const scoreDetail = score100(post.title, post.body, weights);
      const subreddit   = post.platform === 'reddit'
        ? (post as RedditPost).subreddit
        : undefined;

      // Always store in tkg_signals for dedup (even if below threshold)
      await supabase.from('tkg_signals').insert({
        user_id:      userId,
        source:       'social_scan',
        source_id:    `${post.platform}:${post.id}`,
        type:         'social_post',
        content:      `${post.platform}:${post.id} | ${post.title}\n${post.body}`,
        content_hash: post.contentHash,
        author:       post.author,
        recipients:   [],
        occurred_at:  post.postedAt,
        processed:    true,
      });

      // ── Gate at 70/100 ─────────────────────────────────────────────────────
      if (!meetsThreshold(scoreDetail)) {
        log.push(`below-70 (${scoreDetail.score_100}): @${post.author}`);
        continue;
      }

      passed70++;

      // ── Ask Claude to write a personalized, post-specific opening ──────────
      const postForDraft = {
        platform:      post.platform,
        author:        post.author,
        url:           post.url,
        title:         post.title,
        body:          post.body,
        subreddit,
        matchedLabels: scoreDetail.matched_labels,
      };

      const claudeDraft = await draftPersonalizedOutreach(postForDraft, scoreDetail)
        .catch(err => {
          log.push(`claude failed for @${post.author}: ${err.message}`);
          return null;
        });

      const outreach = claudeDraft ?? fallbackDraft({
        ...postForDraft,
        subreddit: subreddit ?? '',
      });

      const draftTitle =
        `[${scoreDetail.score_100}/100] Outreach → @${post.author}` +
        ` on ${post.platform}${subreddit ? ` r/${subreddit}` : ''}`;

      // ── Store in DraftQueue ────────────────────────────────────────────────
      await supabase.from('tkg_actions').insert({
        user_id:        userId,
        directive_text: `Pain signal (${scoreDetail.score_100}/100): ${post.title.slice(0, 120)}`,
        action_type:    'send_message',
        confidence:     scoreDetail.score_100,
        reason:         draftTitle,
        evidence:       [{
          type:        'signal',
          description: `${post.platform} post by @${post.author}: "${post.title.slice(0, 100)}"`,
          date:        post.postedAt,
        }],
        status:         'draft',
        generated_at:   new Date().toISOString(),
        execution_result: {
          // DraftQueue display fields
          _title:        draftTitle,
          _source:       'scan-social',
          draft_type:    'social_outreach',

          // Delivery context
          platform:      post.platform,
          subreddit:     subreddit ?? null,
          to:            `@${post.author} (${post.platform})`,
          post_url:      post.url,
          subject:       outreach.subject,
          body:          outreach.opening,
          platform_note: outreach.platform_note,

          // Full score breakdown — stored for learning loop
          score_100:           scoreDetail.score_100,
          keyword_raw:         scoreDetail.keyword_raw,
          keyword_component:   scoreDetail.keyword_component,
          icp_component:       scoreDetail.icp_component,
          intensity_component: scoreDetail.intensity_component,
          matched_labels:      scoreDetail.matched_labels,
          icp_signals:         scoreDetail.icp_signals,
          intensity_signals:   scoreDetail.intensity_signals,

          // Post context — stored for learning loop analysis
          post_title:    post.title,
          post_preview:  post.body.slice(0, 300),
          draft_angle:   outreach.angle,
          draft_opening: outreach.opening,
          model_version: weights.version,
        },
      });

      newDrafts++;
      log.push(
        `drafted (${scoreDetail.score_100}/100 = ` +
        `kw${scoreDetail.keyword_component}+icp${scoreDetail.icp_component}+int${scoreDetail.intensity_component}) ` +
        `@${post.author} — angle: "${outreach.angle}"`,
      );
    } catch (err: any) {
      log.push(`error ${post.platform}:${post.id}: ${err.message}`);
    }
  }

  const summary = {
    ok:            true,
    scanned,
    passed_70:     passed70,
    new_drafts:    newDrafts,
    deduped:       skippedDupe,
    model_version: weights.version,
    log,
  };

  console.log('[scan-social]', JSON.stringify({ scanned, passed70, newDrafts }));
  return NextResponse.json(summary);
}
