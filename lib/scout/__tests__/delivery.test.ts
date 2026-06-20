import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScoutArtifactProposal } from '../scout-loop';

// ---------------------------------------------------------------------------
// Mocks — the rails are exercised by their own tests; here we stub them so the
// delivery layer's gating, Slack-first fan-out, and channel skipping are what's
// under test. No real Slack / email is ever sent.
// ---------------------------------------------------------------------------

const slackPost = vi.fn();
const sendResendEmail = vi.fn();
const renderDarkTransactionalEmailHtml = vi.fn((..._args: unknown[]) => '<html>scout-email</html>');

vi.mock('@/lib/slack/right-now', () => ({
  resolveSlackAdapterFromEnv: () => ({ postMessage: slackPost }),
}));
vi.mock('@/lib/email/resend', () => ({
  sendResendEmail: (...args: unknown[]) => sendResendEmail(...args),
  renderDarkTransactionalEmailHtml: (...args: unknown[]) => renderDarkTransactionalEmailHtml(...args),
}));

import {
  buildScoutEmailHtml,
  buildScoutEmailSubject,
  buildScoutReviewLink,
  buildScoutSlackMessage,
  deliverScoutProposals,
} from '../delivery';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_ID = '55555555-5555-5555-5555-555555555555';

const PROPOSAL: ScoutArtifactProposal = {
  goal: { text: 'Land a senior backend role', category: 'career', priority: 1 },
  headline: 'Acme is hiring a Senior Backend Engineer (closes Friday)',
  rationale: 'Direct match to your goal and the posting closes this week.',
  artifactTitle: 'Cover letter — Acme Senior Backend Engineer',
  artifactBody: 'Dear Acme team,\n\nWith eight years building distributed systems...\n\nBest,\nAlex',
  confidence: 82,
  webContext: 'Acme posted a Senior Backend Engineer role (source: acme.com/careers).',
  driveSources: [
    { fileName: 'resume.docx', webViewLink: 'http://x/1' },
    { fileName: null, webViewLink: null },
  ],
};

const DELIVERY_ENV_KEYS = [
  'SCOUT_ENABLED',
  'SCOUT_DELIVERY_ENABLED',
  'SCOUT_DELIVERY_EMAIL_TO',
  'FOLDERA_SLACK_SELF_CHANNEL_ID',
  'RESEND_API_KEY',
  'NEXTAUTH_URL',
] as const;

function clearDeliveryEnv(): void {
  for (const key of DELIVERY_ENV_KEYS) delete process.env[key];
}

function enableDelivery(): void {
  process.env.SCOUT_ENABLED = 'true';
  process.env.SCOUT_DELIVERY_ENABLED = 'true';
}

function configureAllChannels(): void {
  process.env.FOLDERA_SLACK_SELF_CHANNEL_ID = 'C0SCOUT';
  process.env.SCOUT_DELIVERY_EMAIL_TO = 'owner@example.com';
  process.env.RESEND_API_KEY = 're_test';
}

function statusFor(channels: Array<{ channel: string; status: string }>, channel: string): string | undefined {
  return channels.find((c) => c.channel === channel)?.status;
}

beforeEach(() => {
  clearDeliveryEnv();
  slackPost.mockReset().mockResolvedValue({ ok: true, mode: 'test_safe', channel: 'C0SCOUT', message_ts: '1', response: {} });
  sendResendEmail.mockReset().mockResolvedValue({ id: 'e1' });
  renderDarkTransactionalEmailHtml.mockClear();
});

afterEach(() => clearDeliveryEnv());

// ---------------------------------------------------------------------------
// Gating
// ---------------------------------------------------------------------------

describe('deliverScoutProposals — gating', () => {
  it('no-ops (no outbound) when SCOUT_DELIVERY_ENABLED is off', async () => {
    configureAllChannels(); // targets present, but the flag is off
    const result = await deliverScoutProposals(USER_ID, [PROPOSAL]);

    expect(result).toEqual({ delivered: false, proposals: 1, channels: [] });
    expect(slackPost).not.toHaveBeenCalled();
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it('no-ops on an empty proposal list even when enabled', async () => {
    enableDelivery();
    configureAllChannels();
    const result = await deliverScoutProposals(USER_ID, []);

    expect(result).toEqual({ delivered: false, proposals: 0, channels: [] });
    expect(slackPost).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Fan-out
// ---------------------------------------------------------------------------

describe('deliverScoutProposals — Slack-first fan-out', () => {
  it('delivers to Slack and email when both are configured', async () => {
    enableDelivery();
    configureAllChannels();

    const result = await deliverScoutProposals(USER_ID, [PROPOSAL]);

    expect(result.delivered).toBe(true);
    expect(result.proposals).toBe(1);
    expect(statusFor(result.channels, 'slack')).toBe('test_safe');
    expect(statusFor(result.channels, 'email')).toBe('sent');

    // Slack-first: it is attempted before email. (The SMS channel was removed;
    // ScoutDeliveryChannel no longer includes it, enforced at the type level.)
    expect(result.channels[0].channel).toBe('slack');

    expect(slackPost).toHaveBeenCalledTimes(1);
    expect(slackPost.mock.calls[0][0].channel).toBe('C0SCOUT');
    expect(sendResendEmail).toHaveBeenCalledTimes(1);
    const emailArg = sendResendEmail.mock.calls[0][0];
    expect(emailArg.to).toBe('owner@example.com');
    expect(emailArg.tags).toContainEqual({ name: 'email_type', value: 'scout_proposal' });
    expect(emailArg.tags).toContainEqual({ name: 'user_id', value: USER_ID });
  });

  it('skips email (target unset) but still delivers the Slack card', async () => {
    enableDelivery();
    process.env.FOLDERA_SLACK_SELF_CHANNEL_ID = 'C0SCOUT';
    // Email target intentionally unset.

    const result = await deliverScoutProposals(USER_ID, [PROPOSAL]);

    expect(statusFor(result.channels, 'slack')).toBe('test_safe');
    expect(statusFor(result.channels, 'email')).toBe('skipped');
    expect(result.delivered).toBe(true);
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it('skips Slack when the channel is unset', async () => {
    enableDelivery();
    process.env.SCOUT_DELIVERY_EMAIL_TO = 'owner@example.com';
    process.env.RESEND_API_KEY = 're_test';
    // Slack channel intentionally unset.

    const result = await deliverScoutProposals(USER_ID, [PROPOSAL]);

    expect(statusFor(result.channels, 'slack')).toBe('skipped');
    expect(statusFor(result.channels, 'email')).toBe('sent');
    expect(slackPost).not.toHaveBeenCalled();
  });

  it('skips email when RESEND_API_KEY is missing even if the target is set', async () => {
    enableDelivery();
    process.env.FOLDERA_SLACK_SELF_CHANNEL_ID = 'C0SCOUT';
    process.env.SCOUT_DELIVERY_EMAIL_TO = 'owner@example.com';
    // RESEND_API_KEY unset.

    const result = await deliverScoutProposals(USER_ID, [PROPOSAL]);

    expect(statusFor(result.channels, 'email')).toBe('skipped');
    expect(sendResendEmail).not.toHaveBeenCalled();
  });

  it('records an error on Slack without sinking email', async () => {
    enableDelivery();
    configureAllChannels();
    slackPost.mockRejectedValueOnce(new Error('slack down'));

    const result = await deliverScoutProposals(USER_ID, [PROPOSAL]);

    expect(statusFor(result.channels, 'slack')).toBe('error');
    expect(result.channels.find((c) => c.channel === 'slack')?.detail).toContain('slack down');
    expect(statusFor(result.channels, 'email')).toBe('sent');
    expect(result.delivered).toBe(true); // email still ran
  });

  it('reports a live Slack send as sent', async () => {
    enableDelivery();
    process.env.FOLDERA_SLACK_SELF_CHANNEL_ID = 'C0SCOUT';
    slackPost.mockResolvedValue({ ok: true, mode: 'live', channel: 'C0SCOUT', message_ts: '1', response: {} });

    const result = await deliverScoutProposals(USER_ID, [PROPOSAL]);
    expect(statusFor(result.channels, 'slack')).toBe('sent');
  });
});

// ---------------------------------------------------------------------------
// Content builders
// ---------------------------------------------------------------------------

describe('scout delivery content builders', () => {
  it('buildScoutReviewLink points at the dashboard review surface', () => {
    process.env.NEXTAUTH_URL = 'https://app.foldera.ai/';
    expect(buildScoutReviewLink()).toBe('https://app.foldera.ai/dashboard');
  });

  it('the Slack message carries the full proposal + review link within the section limit', () => {
    const link = 'https://foldera.ai/dashboard';
    const msg = buildScoutSlackMessage(PROPOSAL, 'C0SCOUT', link);

    expect(msg.channel).toBe('C0SCOUT');
    const sectionText = (msg.blocks[0] as { text: { text: string } }).text.text;
    expect(sectionText).toContain('Acme is hiring');
    expect(sectionText).toContain('Cover letter — Acme Senior Backend Engineer');
    expect(sectionText).toContain('Dear Acme team'); // the full artifact rides Slack
    expect(sectionText).toContain('Grounded in: resume.docx');
    expect(sectionText).toContain(`Review in Foldera: ${link}`);
    expect(sectionText.length).toBeLessThanOrEqual(2900);
  });

  it('clips an oversized artifact body but keeps the section under the Slack limit', () => {
    const link = 'https://foldera.ai/dashboard';
    const huge = { ...PROPOSAL, artifactBody: 'x'.repeat(5000) };
    const msg = buildScoutSlackMessage(huge, 'C0SCOUT', link);
    const sectionText = (msg.blocks[0] as { text: { text: string } }).text.text;
    expect(sectionText.length).toBeLessThanOrEqual(2900);
  });

  it('the email subject is headline-led and clipped', () => {
    expect(buildScoutEmailSubject(PROPOSAL)).toMatch(/^Foldera Scout: /);
    expect(buildScoutEmailSubject(PROPOSAL).length).toBeLessThanOrEqual(70);
  });

  it('the email HTML is built from the dark transactional template with a review CTA', () => {
    const link = 'https://foldera.ai/dashboard';
    buildScoutEmailHtml(PROPOSAL, link);

    expect(renderDarkTransactionalEmailHtml).toHaveBeenCalledTimes(1);
    const arg = renderDarkTransactionalEmailHtml.mock.calls[0][0] as {
      eyebrow: string;
      title: string;
      ctaLabel: string;
      ctaHref: string;
    };
    expect(arg.eyebrow).toBe('Foldera Scout');
    expect(arg.title).toContain('Acme is hiring');
    expect(arg.ctaLabel).toBe('Review in Foldera');
    expect(arg.ctaHref).toBe(link);
  });
});
