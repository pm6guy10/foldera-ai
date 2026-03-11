/**
 * Outreach Drafter — Claude-powered personalized outreach.
 *
 * For each post scoring 70+, Claude writes a message that:
 *  - References something SPECIFIC from the post (not a template)
 *  - Leads with their pain, not our product
 *  - Sounds human, not marketing
 *  - Has no pitch in the first message — the CTA is empathy
 *
 * GROWTH.md outreach rules encoded here:
 *  1. Never spam. One message per person.
 *  2. Lead with their pain, not our product.
 *  3. No pitch in the first message.
 *  4. Personalize to their specific post.
 *  5. Brandon sends every message manually after DraftQueue review.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ScoreDetail } from './scorer';

export interface OutreachDraft {
  subject:       string;   // For DM/email subject or Reddit reply thread title
  opening:       string;   // The personalized first message (2-4 sentences)
  angle:         string;   // One-line description of the empathy angle Claude used
  platform_note: string;   // Guidance on how to send (Reddit reply vs DM vs Twitter)
}

const SYSTEM = `You are Brandon, the founder of Foldera — an AI personal chief of staff.
You are NOT writing marketing copy. You are writing a genuine, human first message to
someone who posted about a problem you deeply understand because you built a product to solve it.

RULES (non-negotiable from GROWTH.md):
1. Reference something SPECIFIC from their post. Quote or paraphrase what they said.
   Never write a generic message that could apply to anyone.
2. Lead with empathy, not product. Make them feel seen first.
3. No pitch in the first message. Zero mention of Foldera by name.
   If they ask what you're building, you'll tell them — but not in the opener.
4. The CTA is a question or shared experience — not a link, not a demo request.
5. Maximum 3 sentences. Sound like a human, not a startup founder.
6. If the post is on Reddit, write it as a Reddit comment reply.
   If it's Twitter/X, write it as a reply tweet (under 280 chars if possible).

Return ONLY valid JSON (no markdown):
{
  "subject": "Re: [their post title shortened to 60 chars]",
  "opening": "the 2-4 sentence message",
  "angle": "one sentence describing the specific empathy angle you used",
  "platform_note": "one sentence on how to deliver this (e.g. reply to their comment, send DM after reply, etc.)"
}`;

function getClient(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');
  return new Anthropic({ apiKey: key });
}

/**
 * Draft a personalized outreach message for a specific post.
 *
 * @param post  The scored social post
 * @param score The detailed score breakdown (used for context)
 * @returns     PersonalizedOutreachDraft or null on failure
 */
export async function draftPersonalizedOutreach(post: {
  platform:      string;
  author:        string;
  url:           string;
  title:         string;
  body:          string;
  subreddit?:    string;
  matchedLabels: string[];
}, score: ScoreDetail): Promise<OutreachDraft | null> {
  const client = getClient();

  const context = `
PLATFORM: ${post.platform}${post.subreddit ? ` (r/${post.subreddit})` : ''}
AUTHOR: @${post.author}
POST URL: ${post.url}

POST TITLE:
${post.title}

POST BODY:
${post.body.slice(0, 1500)}

PAIN SIGNALS DETECTED:
- Matched labels: ${post.matchedLabels.join(', ')}
- ICP signals: ${score.icp_signals.join(', ') || 'none detected'}
- Intensity signals: ${score.intensity_signals.join(', ') || 'none detected'}
- Pain score: ${score.score_100}/100

Write a personalized reply that makes @${post.author} feel genuinely heard.
Reference something SPECIFIC from their post above.`;

  try {
    const response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 512,
      system:     SYSTEM,
      messages:   [{ role: 'user', content: context }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Strip any accidental markdown code fences
    const clean = text.replace(/```json\s*/g, '').replace(/```/g, '').trim();
    const match = clean.match(/(\{[\s\S]*\})/);
    if (!match) {
      console.warn('[outreach-drafter] no JSON in response');
      return null;
    }

    const parsed = JSON.parse(match[1]) as OutreachDraft;

    // Validate required fields
    if (!parsed.opening || !parsed.angle) {
      console.warn('[outreach-drafter] missing fields in response');
      return null;
    }

    return parsed;
  } catch (err: any) {
    console.error('[outreach-drafter] Claude call failed:', err.message);
    return null;
  }
}

/**
 * Fallback template if Claude call fails.
 * Much worse than Claude's version — only used as last resort.
 */
export function fallbackDraft(post: {
  author:        string;
  title:         string;
  matchedLabels: string[];
  platform:      string;
  subreddit?:    string;
  url:           string;
}): OutreachDraft {
  const painLabel = post.matchedLabels[0] ?? 'this';
  const platform  = post.platform === 'reddit'
    ? `r/${post.subreddit}`
    : 'Twitter/X';

  return {
    subject:      `Re: ${post.title.slice(0, 60)}`,
    opening:      `Came across your post on ${platform} about ${painLabel} and it resonated. Feels like there's real pain here — has anything worked for you so far?`,
    angle:        'Generic empathy fallback — Claude call failed',
    platform_note: `Reply directly to the post at ${post.url}`,
  };
}
