/**
 * Outlook email client (Microsoft Graph)
 *
 * Fetches recent emails for a user and returns them as plain-text snippets
 * suitable for passing to extractFromConversation().
 *
 * Token retrieval delegates to lib/auth/token-store → integrations table,
 * which is populated at login time by the jwt callback in auth-options.ts.
 */

import { getMicrosoftTokens } from '@/lib/auth/token-store';

interface GraphMessage {
  id: string;
  subject: string;
  bodyPreview: string;
  receivedDateTime: string;
  from: { emailAddress: { name: string; address: string } } | null;
}

/**
 * Fetch emails from the last `hoursBack` hours via Microsoft Graph.
 * Returns an array of plain-text snippets (one per email).
 * Returns empty array if no tokens are available or on non-fatal errors.
 */
export async function fetchOutlookEmails(
  userId: string,
  hoursBack = 24,
): Promise<string[]> {
  const tokens = await getMicrosoftTokens(userId);
  if (!tokens) {
    console.log('[outlook] no tokens for user', userId);
    return [];
  }

  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

  // Microsoft Graph — inbox messages since `since`, ordered newest first
  const url =
    `https://graph.microsoft.com/v1.0/me/messages` +
    `?$filter=receivedDateTime ge ${since}` +
    `&$select=id,subject,bodyPreview,from,receivedDateTime` +
    `&$top=50` +
    `&$orderby=receivedDateTime desc`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Microsoft Graph ${res.status}: ${body}`);
  }

  const data = await res.json() as { value: GraphMessage[] };
  const messages = data.value ?? [];

  if (messages.length === 0) return [];

  return messages.map(m => {
    const from = m.from?.emailAddress
      ? `${m.from.emailAddress.name} <${m.from.emailAddress.address}>`
      : 'unknown';
    return (
      `[Email received: ${m.receivedDateTime}]\n` +
      `From: ${from}\n` +
      `Subject: ${m.subject ?? '(no subject)'}\n` +
      `Preview: ${m.bodyPreview ?? ''}`
    );
  });
}

/**
 * Send an email via Microsoft Graph on behalf of a user.
 * Returns { success, messageId?, error? }.
 */
export async function sendOutlookEmail(
  userId: string,
  { to, subject, body }: { to: string; subject: string; body: string },
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const tokens = await getMicrosoftTokens(userId);
  if (!tokens) return { success: false, error: 'No Microsoft tokens for user' };

  const payload = {
    message: {
      subject,
      body: { contentType: 'Text', content: body },
      toRecipients: [{ emailAddress: { address: to } }],
    },
    saveToSentItems: true,
  };

  try {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 202) {
      return { success: true };
    }

    const text = await res.text().catch(() => '');
    console.error('[outlook] send failed:', res.status, text);
    return { success: false, error: `Graph ${res.status}: ${text.slice(0, 200)}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[outlook] send failed:', msg);
    return { success: false, error: msg };
  }
}
