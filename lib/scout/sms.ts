/**
 * Twilio SMS adapter for phone-first Scout delivery (issue #486, Stage 4).
 *
 * Mirrors the Slack adapter shape in lib/slack/right-now.ts: a test-safe adapter
 * that never touches the network is the default, and a live Twilio adapter is only
 * resolved on Vercel production when every TWILIO_* secret is present. The TWILIO_*
 * secrets are owner-gated (AGENTS.md / ACTIVE_HANDOFF.md), so in the agent sandbox,
 * tests, preview, and local dev this stays test-safe and free — no SMS is sent and
 * no paid Twilio call is made.
 *
 * SMS is a NUDGE, never the artifact: it carries a one-line headline plus a deep
 * link back into Foldera for review. The finished, review-gated artifact itself
 * rides the richer rails (Slack/email) and is never auto-sent to a third party.
 *
 * Secrets are read only inside functions, never at module top level.
 */

export type ScoutSmsMessage = {
  to: string;
  body: string;
};

export type ScoutSmsSendResult = {
  ok: true;
  mode: 'live' | 'test_safe';
  to: string;
  /** Twilio message SID on a live send; null in test-safe mode. */
  sid: string | null;
};

export type ScoutSmsAdapter = {
  send(message: ScoutSmsMessage): Promise<ScoutSmsSendResult>;
};

/** Default adapter everywhere the owner has not turned on a live, prod, fully-keyed lane. */
export function createTestSafeSmsAdapter(): ScoutSmsAdapter {
  return {
    async send(message) {
      return { ok: true, mode: 'test_safe', to: message.to, sid: null };
    },
  };
}

/** Live Twilio REST adapter. Only constructed when all secrets are present in production. */
export function createLiveTwilioAdapter(
  config: { accountSid: string; authToken: string; fromNumber: string },
  fetchImpl: typeof fetch = fetch,
): ScoutSmsAdapter {
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(
    config.accountSid,
  )}/Messages.json`;
  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');

  return {
    async send(message) {
      const form = new URLSearchParams({
        To: message.to,
        From: config.fromNumber,
        Body: message.body,
      });
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Basic ${auth}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });
      const json = (await response.json().catch(() => ({}))) as {
        sid?: string;
        message?: string;
        code?: number;
      };
      if (!response.ok || !json.sid) {
        throw new Error(`Twilio send failed: ${json.message ?? response.status}`);
      }
      return { ok: true, mode: 'live', to: message.to, sid: json.sid };
    },
  };
}

/**
 * Resolve the SMS adapter from env. Fail-closed: a live Twilio send happens only on
 * Vercel production with TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER
 * all set. Anywhere else (preview, local, tests, the secret-less agent sandbox) this
 * returns the test-safe adapter, so the delivery path is provable for free.
 */
export function resolveSmsAdapterFromEnv(fetchImpl: typeof fetch = fetch): ScoutSmsAdapter {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim();
  const isProduction = process.env.VERCEL_ENV === 'production';

  if (!isProduction || !accountSid || !authToken || !fromNumber) {
    return createTestSafeSmsAdapter();
  }
  return createLiveTwilioAdapter({ accountSid, authToken, fromNumber }, fetchImpl);
}
