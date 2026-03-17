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
