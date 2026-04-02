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

function normalizeMessageIdHeader(value: string): string {
  const t = value.trim();
  if (!t) return t;
  if (t.startsWith('<') && t.endsWith('>')) return t;
  return `<${t}>`;
}

export type SendOutlookEmailOptions = {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
  references?: string | null;
};

/**
 * Send an email via Microsoft Graph on behalf of a user.
 * Returns { success, messageId?, error? }.
 */
export async function sendOutlookEmail(
  userId: string,
  { to, subject, body, inReplyTo, references }: SendOutlookEmailOptions,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const tokens = await getMicrosoftTokens(userId);
  if (!tokens) return { success: false, error: 'No Microsoft tokens for user' };

  const message: Record<string, unknown> = {
    subject,
    body: { contentType: 'Text', content: body },
    toRecipients: [{ emailAddress: { address: to } }],
  };
  const headers: Array<{ name: string; value: string }> = [];
  if (inReplyTo?.trim()) {
    headers.push({ name: 'In-Reply-To', value: normalizeMessageIdHeader(inReplyTo) });
  }
  if (references?.trim()) {
    headers.push({ name: 'References', value: references.trim() });
  }
  if (headers.length > 0) {
    message.internetMessageHeaders = headers;
  }

  const payload = {
    message,
    saveToSentItems: true,
  };

  try {
    let currentToken = tokens.access_token;

    let res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // Retry once on 401 with refreshed token
    if (res.status === 401) {
      console.log('[outlook] send 401 — forcing token refresh');
      const refreshed = await getMicrosoftTokens(userId);
      if (!refreshed) return { success: false, error: 'Token refresh failed' };
      currentToken = refreshed.access_token;
      res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: { Authorization: `Bearer ${currentToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

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
