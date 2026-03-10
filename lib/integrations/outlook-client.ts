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
