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

/** Ensure Message-ID form for In-Reply-To / References headers. */
function normalizeMessageIdHeader(value: string): string {
  const t = value.trim();
  if (!t) return t;
  if (t.startsWith('<') && t.endsWith('>')) return t;
  return `<${t}>`;
}

export type SendGmailEmailOptions = {
  to: string;
  subject: string;
  body: string;
  /** Gmail thread id — keeps the sent message in the same conversation. */
  threadId?: string | null;
  /** RFC 5322 Message-ID of the message being replied to. */
  inReplyTo?: string | null;
  /** Space-separated prior Message-IDs for threading (often includes in_reply_to). */
  references?: string | null;
};

/**
 * Send an email via Gmail API on behalf of a user.
 * Returns { success, messageId?, error? }.
 */
export async function sendGmailEmail(
  userId: string,
  { to, subject, body, threadId, inReplyTo, references }: SendGmailEmailOptions,
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

  // RFC 2822 message (optional reply headers for in-thread delivery)
  const messageParts: string[] = [`To: ${to}`, `Subject: ${subject}`];
  if (inReplyTo?.trim()) {
    messageParts.push(`In-Reply-To: ${normalizeMessageIdHeader(inReplyTo)}`);
  }
  if (references?.trim()) {
    messageParts.push(`References: ${references.trim()}`);
  }
  messageParts.push('Content-Type: text/plain; charset=UTF-8', '', body);
  const raw = Buffer.from(messageParts.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    const requestBody: { raw: string; threadId?: string } = { raw };
    if (threadId?.trim()) {
      requestBody.threadId = threadId.trim();
    }
    const res = await gmail.users.messages.send({ userId: 'me', requestBody });
    return { success: true, messageId: res.data.id ?? undefined };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[gmail] send failed:', msg);
    return { success: false, error: msg };
  }
}
