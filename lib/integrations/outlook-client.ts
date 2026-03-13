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
  body?: { content: string; contentType: string };
  receivedDateTime: string;
  from: { emailAddress: { name: string; address: string } } | null;
}

interface GraphSentMessage {
  id: string;
  subject: string;
  bodyPreview: string;
  body?: { content: string; contentType: string };
  sentDateTime: string;
  toRecipients?: Array<{ emailAddress: { name: string; address: string } }>;
}

const GRAPH_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'Prefer': 'outlook.body-content-type="text"',
});

/**
 * Fetch emails from the last `hoursBack` hours via Microsoft Graph.
 * Fetches both inbox and sent items, combines them sorted by date descending.
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

  const [inboxRes, sentRes] = await Promise.all([
    fetch(
      `https://graph.microsoft.com/v1.0/me/messages` +
      `?$filter=receivedDateTime ge ${since}` +
      `&$select=id,subject,bodyPreview,body,from,receivedDateTime` +
      `&$top=50&$orderby=receivedDateTime desc`,
      { headers: GRAPH_HEADERS(tokens.access_token) },
    ),
    fetch(
      `https://graph.microsoft.com/v1.0/me/mailFolders/SentItems/messages` +
      `?$filter=sentDateTime ge ${since}` +
      `&$select=id,subject,bodyPreview,body,toRecipients,sentDateTime` +
      `&$top=50&$orderby=sentDateTime desc`,
      { headers: GRAPH_HEADERS(tokens.access_token) },
    ),
  ]);

  if (!inboxRes.ok) {
    const body = await inboxRes.text().catch(() => '');
    throw new Error(`Microsoft Graph inbox ${inboxRes.status}: ${body}`);
  }

  const inboxData = await inboxRes.json() as { value: GraphMessage[] };
  const inboxMessages = inboxData.value ?? [];

  let sentMessages: GraphSentMessage[] = [];
  if (sentRes.ok) {
    const sentData = await sentRes.json() as { value: GraphSentMessage[] };
    sentMessages = sentData.value ?? [];
  } else {
    console.warn('[outlook] sent items fetch failed:', sentRes.status);
  }

  type Item = { dateStr: string; text: string };
  const items: Item[] = [];

  for (const m of inboxMessages) {
    const from = m.from?.emailAddress
      ? `${m.from.emailAddress.name} <${m.from.emailAddress.address}>`
      : 'unknown';
    const cleanBody = (m.body?.content ?? m.bodyPreview ?? '').slice(0, 3000);
    items.push({
      dateStr: m.receivedDateTime,
      text: (
        `[Email received: ${m.receivedDateTime}]\n` +
        `From: ${from}\n` +
        `Subject: ${m.subject ?? '(no subject)'}\n` +
        `Body:\n${cleanBody}`
      ),
    });
  }

  for (const m of sentMessages) {
    const to = (m.toRecipients ?? [])
      .map(r => `${r.emailAddress?.name ?? ''} <${r.emailAddress?.address ?? ''}>`)
      .join(', ');
    const cleanBody = (m.body?.content ?? m.bodyPreview ?? '').slice(0, 3000);
    items.push({
      dateStr: m.sentDateTime,
      text: (
        `[Email sent: ${m.sentDateTime}]\n` +
        `To: ${to}\n` +
        `Subject: ${m.subject ?? '(no subject)'}\n` +
        `Body:\n${cleanBody}`
      ),
    });
  }

  items.sort((a, b) => new Date(b.dateStr).getTime() - new Date(a.dateStr).getTime());

  return items.map(i => i.text);
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
