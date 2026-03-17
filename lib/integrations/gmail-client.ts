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
 * Send an email via Gmail API on behalf of a user.
 * Returns { success, messageId?, error? }.
 */
export async function sendGmailEmail(
  userId: string,
  { to, subject, body }: { to: string; subject: string; body: string },
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const tokens = await getGoogleTokens(userId);
  if (!tokens) return { success: false, error: 'No Google tokens for user' };

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date:   tokens.expiry_date,
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // RFC 2822 message
  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
  ];
  const raw = Buffer.from(messageParts.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return { success: true, messageId: res.data.id ?? undefined };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[gmail] send failed:', msg);
    return { success: false, error: msg };
  }
}
