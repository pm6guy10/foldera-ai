/**
 * Gmail email client (Google APIs Node.js client)
 *
 * Fetches recent emails for a user and returns them as plain-text snippets
 * suitable for passing to extractFromConversation().
 *
 * Token retrieval delegates to lib/auth/token-store → integrations table,
 * which is populated at login time by the jwt callback in auth-options.ts.
 */

import { google } from 'googleapis';
import { getGoogleTokens } from '@/lib/auth/token-store';

/**
 * Fetch emails from the last `hoursBack` hours via Gmail API.
 * Returns an array of plain-text snippets (one per email).
 * Returns empty array if no tokens are available or on non-fatal errors.
 */
export async function fetchGmailEmails(
  userId: string,
  hoursBack = 24,
): Promise<string[]> {
  const tokens = await getGoogleTokens(userId);
  if (!tokens) {
    console.log('[gmail] no tokens for user', userId);
    return [];
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Gmail query: messages received after `since` (unix seconds)
  const afterSec = Math.floor((Date.now() - hoursBack * 60 * 60 * 1000) / 1000);

  const list = await gmail.users.messages.list({
    userId: 'me',
    q: `after:${afterSec}`,
    maxResults: 50,
  });

  const messageIds = list.data.messages ?? [];
  if (messageIds.length === 0) return [];

  const snippets: string[] = [];

  // Fetch metadata (subject, from, date) + snippet for each message
  for (const { id } of messageIds) {
    if (!id) continue;
    try {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date'],
      });

      const headers = msg.data.payload?.headers ?? [];
      const get = (name: string) =>
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

      const snippet = msg.data.snippet ?? '';

      snippets.push(
        `[Email received: ${get('Date')}]\n` +
        `From: ${get('From')}\n` +
        `Subject: ${get('Subject') || '(no subject)'}\n` +
        `Preview: ${snippet}`,
      );
    } catch (err) {
      // Skip individual message errors — don't abort the whole batch
      console.warn('[gmail] could not fetch message', id, err);
    }
  }

  return snippets;
}
