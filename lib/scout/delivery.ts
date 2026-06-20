/**
 * Phone-first delivery of finished Scout proposals (issue #486, Stage 4).
 *
 * Stage 3 (lib/scout/scout-loop.ts) produces finished, review-gated artifact
 * proposals and RETURNS them — it never surfaces anything. Stage 4 is the surface:
 * it notifies the owner, phone-first, that finished work is waiting for review.
 *
 * Doctrine (ACTIVE_HANDOFF.md / Bible Part V):
 * - Additive and flag-gated: the whole layer no-ops when SCOUT_DELIVERY_ENABLED is
 *   off (which itself requires the Scout master flag), so the Workday Presence Layer
 *   is the unchanged default.
 * - Never auto-sends: delivery only notifies the OWNER on their OWN rails (an SMS
 *   nudge with a deep link, plus the full proposal on Slack/email for review). The
 *   artifact is never auto-sent to a third party — the owner reviews, then acts.
 * - Phone-first: SMS goes first (the nudge + deep link); Slack and email carry the
 *   full finished artifact for review. Each channel self-skips when its target is
 *   not configured, so partial setups degrade gracefully instead of throwing.
 *
 * All rails are reused as-is (lib/scout/sms.ts, lib/slack/right-now.ts,
 * lib/email/resend.ts). All targets and secrets are owner-gated env and are read
 * only inside functions, never at module top level.
 */

import { isScoutDeliveryEnabled } from '@/lib/config/prelaunch-spend';
import { sendResendEmail, renderDarkTransactionalEmailHtml } from '@/lib/email/resend';
import { resolveSlackAdapterFromEnv, type SlackRightNowMessage } from '@/lib/slack/right-now';
import { resolveSmsAdapterFromEnv } from '@/lib/scout/sms';
import type { ScoutArtifactProposal } from '@/lib/scout/scout-loop';

/** SMS is a nudge, not the artifact — keep it inside two GSM segments. */
const SMS_MAX_CHARS = 320;
/** Slack section text hard limit is 3000 chars; stay comfortably under it. */
const SLACK_SECTION_MAX = 2900;
const SLACK_ARTIFACT_MAX = 2400;
const EMAIL_SUBJECT_MAX = 70;

export type ScoutDeliveryChannel = 'sms' | 'slack' | 'email';

export type ScoutDeliveryChannelResult = {
  channel: ScoutDeliveryChannel;
  /** sent = live; test_safe = adapter ran but no real outbound; skipped = not configured. */
  status: 'sent' | 'test_safe' | 'skipped' | 'error';
  detail?: string;
};

export type ScoutDeliveryResult = {
  /** True when at least one channel ran (live or test-safe) for at least one proposal. */
  delivered: boolean;
  proposals: number;
  channels: ScoutDeliveryChannelResult[];
};

function resolveBaseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? 'https://foldera.ai').replace(/\/$/, '');
}

/** The deep link the phone nudge points at — the existing dashboard review surface. */
export function buildScoutReviewLink(): string {
  return `${resolveBaseUrl()}/dashboard`;
}

function clip(value: string, limit: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

/** One-line phone nudge: headline + deep link, never the artifact body. */
export function buildScoutSmsBody(proposal: ScoutArtifactProposal, link: string): string {
  const tail = `\nReview: ${link}`;
  const room = Math.max(0, SMS_MAX_CHARS - tail.length);
  const lead = clip(`Foldera Scout found something for you: ${proposal.headline}`, room);
  return `${lead}${tail}`;
}

/** Subject for the review email — headline-led, clipped. */
export function buildScoutEmailSubject(proposal: ScoutArtifactProposal): string {
  const headline = proposal.headline.replace(/\s+/g, ' ').trim() || 'an opportunity matched to your goal';
  return clip(`Foldera Scout: ${headline}`, EMAIL_SUBJECT_MAX);
}

function driveSourceNames(proposal: ScoutArtifactProposal): string[] {
  return proposal.driveSources
    .map((source) => source.fileName?.trim())
    .filter((name): name is string => Boolean(name))
    .slice(0, 5);
}

/** Full review-gated proposal as a single Slack section (with the deep link). */
export function buildScoutSlackMessage(
  proposal: ScoutArtifactProposal,
  channel: string,
  link: string,
): SlackRightNowMessage {
  const parts = [
    '*Foldera Scout — finished work for your review*',
    `*${proposal.headline.trim()}*`,
  ];
  const rationale = proposal.rationale.trim();
  if (rationale) parts.push(`_${rationale}_`);
  parts.push('', `*${proposal.artifactTitle.trim()}*`, clip(proposal.artifactBody, SLACK_ARTIFACT_MAX));

  const sources = driveSourceNames(proposal);
  if (sources.length > 0) parts.push('', `Grounded in: ${sources.join(', ')}`);
  parts.push('', `Review in Foldera: ${link}`);

  return {
    channel,
    text: 'Foldera Scout — finished work for your review',
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: clip(parts.join('\n'), SLACK_SECTION_MAX) },
      },
    ],
  };
}

/** Full review-gated proposal as a transactional email (reuses the dark template). */
export function buildScoutEmailHtml(proposal: ScoutArtifactProposal, link: string): string {
  const sources = driveSourceNames(proposal);
  const bodyLines = [
    proposal.rationale.trim() || 'A finished, review-gated artifact matched to one of your goals.',
    '',
    proposal.artifactTitle.trim(),
    ...proposal.artifactBody.trim().split('\n'),
  ];
  if (sources.length > 0) {
    bodyLines.push('', `Grounded in: ${sources.join(', ')}`);
  }
  return renderDarkTransactionalEmailHtml({
    eyebrow: 'Foldera Scout',
    title: proposal.headline.trim() || 'Foldera found an opportunity',
    bodyLines,
    ctaLabel: 'Review in Foldera',
    ctaHref: link,
  });
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function deliverOneProposal(
  userId: string,
  proposal: ScoutArtifactProposal,
  link: string,
): Promise<ScoutDeliveryChannelResult[]> {
  const results: ScoutDeliveryChannelResult[] = [];

  // 1) Phone-first: the SMS nudge.
  const smsTo = process.env.SCOUT_DELIVERY_SMS_TO?.trim();
  if (!smsTo) {
    results.push({ channel: 'sms', status: 'skipped', detail: 'SCOUT_DELIVERY_SMS_TO not set' });
  } else {
    try {
      const res = await resolveSmsAdapterFromEnv().send({
        to: smsTo,
        body: buildScoutSmsBody(proposal, link),
      });
      results.push({ channel: 'sms', status: res.mode === 'live' ? 'sent' : 'test_safe' });
    } catch (err) {
      results.push({ channel: 'sms', status: 'error', detail: errorMessage(err) });
    }
  }

  // 2) Slack: the full proposal for review (reuses the self-loop channel).
  const slackChannel = process.env.FOLDERA_SLACK_SELF_CHANNEL_ID?.trim();
  if (!slackChannel) {
    results.push({ channel: 'slack', status: 'skipped', detail: 'FOLDERA_SLACK_SELF_CHANNEL_ID not set' });
  } else {
    try {
      const res = await resolveSlackAdapterFromEnv().postMessage(
        buildScoutSlackMessage(proposal, slackChannel, link),
      );
      results.push({ channel: 'slack', status: res.mode === 'live' ? 'sent' : 'test_safe' });
    } catch (err) {
      results.push({ channel: 'slack', status: 'error', detail: errorMessage(err) });
    }
  }

  // 3) Email: the full proposal for review (reuses the Resend rail).
  const emailTo = process.env.SCOUT_DELIVERY_EMAIL_TO?.trim();
  if (!emailTo) {
    results.push({ channel: 'email', status: 'skipped', detail: 'SCOUT_DELIVERY_EMAIL_TO not set' });
  } else if (!process.env.RESEND_API_KEY) {
    results.push({ channel: 'email', status: 'skipped', detail: 'RESEND_API_KEY not set' });
  } else {
    try {
      await sendResendEmail({
        to: emailTo,
        subject: buildScoutEmailSubject(proposal),
        html: buildScoutEmailHtml(proposal, link),
        tags: [
          { name: 'email_type', value: 'scout_proposal' },
          { name: 'user_id', value: userId },
        ],
      });
      results.push({ channel: 'email', status: 'sent' });
    } catch (err) {
      results.push({ channel: 'email', status: 'error', detail: errorMessage(err) });
    }
  }

  return results;
}

/**
 * Deliver finished Scout proposals to the owner, phone-first. No-ops (returns
 * delivered=false, no outbound) when SCOUT_DELIVERY_ENABLED is off or there is
 * nothing to deliver, so default behavior is unchanged. Never auto-sends an
 * artifact to a third party — it only notifies the owner on their own rails.
 */
export async function deliverScoutProposals(
  userId: string,
  proposals: ScoutArtifactProposal[],
): Promise<ScoutDeliveryResult> {
  if (!isScoutDeliveryEnabled() || proposals.length === 0) {
    return { delivered: false, proposals: proposals.length, channels: [] };
  }

  const link = buildScoutReviewLink();
  const channels: ScoutDeliveryChannelResult[] = [];
  for (const proposal of proposals) {
    channels.push(...(await deliverOneProposal(userId, proposal, link)));
  }

  const delivered = channels.some((c) => c.status === 'sent' || c.status === 'test_safe');
  return { delivered, proposals: proposals.length, channels };
}
