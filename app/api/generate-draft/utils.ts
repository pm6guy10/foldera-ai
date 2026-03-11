import { google, gmail_v1 } from 'googleapis';
import { getGoogleAccessToken } from '@/lib/meeting-prep/auth';
import { extractBody } from '@/lib/plugins/gmail/scanner';

export type ThreadHistoryEntry = {
  from: string;
  subject?: string;
  date: string;
  body: string;
};

export type ThreadExtraction = {
  incomingEmailBody: string;
  lastIncomingMessageId?: string;
  historyEntries: ThreadHistoryEntry[];
  lastUserMessage: string;
  incomingSenderEmail?: string;
  incomingSenderName?: string;
  incomingSubject?: string;
};

export async function getGmailClient(userId: string) {
  const accessToken = await getGoogleAccessToken(userId);
  const oauthClient = new google.auth.OAuth2();
  oauthClient.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth: oauthClient });
}

export async function fetchThread(
  gmail: gmail_v1.Gmail,
  identifier: string
): Promise<gmail_v1.Schema$Thread> {
  try {
    const response = await gmail.users.threads.get({
      userId: 'me',
      id: identifier,
      format: 'full',
    });
    return response.data;
  } catch (error: any) {
    if (error.code !== 404) {
      throw error;
    }

    const messageResponse = await gmail.users.messages.get({
      userId: 'me',
      id: identifier,
      format: 'full',
    });

    const threadId = messageResponse.data.threadId;
    if (!threadId) {
      throw new Error('Unable to resolve thread from message ID');
    }

    const threadResponse = await gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'full',
    });

    return threadResponse.data;
  }
}

export function extractEmail(value: string): string {
  const match = value.match(/<(.+?)>/);
  const raw = match ? match[1] : value;
  return raw.trim().toLowerCase();
}

export function extractPlainBody(message: gmail_v1.Schema$Message): string {
  const payload = message.payload;
  if (!payload) {
    return message.snippet || '';
  }

  const { text, html } = extractBody(payload);
  if (text) {
    return text.trim();
  }
  if (html) {
    return stripHtml(html);
  }
  return message.snippet || '';
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isUserMessage(
  message: gmail_v1.Schema$Message,
  fromHeader: string,
  userEmail?: string | null
): boolean {
  const normalizedFrom = extractEmail(fromHeader);
  const normalizedUser = (userEmail || '').toLowerCase();
  if (normalizedUser && normalizedFrom === normalizedUser) {
    return true;
  }
  return message.labelIds?.includes('SENT') ?? false;
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string | undefined {
  if (!headers) return undefined;
  const header = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value ?? undefined;
}

function formatDate(internalDate?: string | null): string {
  if (!internalDate) return 'Unknown date';
  const date = new Date(Number(internalDate));
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function parseSender(value: string): { email?: string; name?: string } {
  const email = extractEmail(value);
  const nameMatch = value.match(/^"?([^"<]+)"?\s*</);
  const cleanedName = nameMatch ? nameMatch[1].trim() : undefined;
  return {
    email: email || undefined,
    name: cleanedName || undefined,
  };
}

export function extractThreadDetails(
  messages: gmail_v1.Schema$Message[],
  userEmail: string | null | undefined
): ThreadExtraction {
  const sortedMessages = [...messages].sort((a, b) => {
    const aDate = Number(a.internalDate || 0);
    const bDate = Number(b.internalDate || 0);
    return aDate - bDate;
  });

  let incomingEmailBody = '';
  let incomingMessageId = '';
  let lastUserMessage = '';
  let lastSenderEmail: string | undefined;
  let lastSenderName: string | undefined;
  let lastSubject: string | undefined;
  const historyEntries: ThreadHistoryEntry[] = [];

  for (const message of sortedMessages) {
    const headers = message.payload?.headers || [];
    const fromHeader = getHeader(headers, 'From') || 'Unknown sender';
    const subject = getHeader(headers, 'Subject') || '';
    const date = formatDate(message.internalDate);
    const body = extractPlainBody(message) || message.snippet || '';

    historyEntries.push({
      from: fromHeader,
      subject: subject || undefined,
      date,
      body,
    });

    if (isUserMessage(message, fromHeader, userEmail)) {
      if (body) {
        lastUserMessage = body;
      }
    } else {
      if (body) {
        incomingEmailBody = body;
        incomingMessageId = message.id || incomingMessageId;
        lastSubject = subject || lastSubject;
        const { email, name } = parseSender(fromHeader);
        lastSenderEmail = email || lastSenderEmail;
        lastSenderName = name || lastSenderName;
      }
    }
  }

  return {
    incomingEmailBody: incomingEmailBody.trim(),
    lastIncomingMessageId: incomingMessageId || undefined,
    historyEntries,
    lastUserMessage: lastUserMessage.trim(),
    incomingSenderEmail: lastSenderEmail,
    incomingSenderName: lastSenderName,
    incomingSubject: lastSubject,
  };
}

export async function generateDraftForThread({
  userId,
  userEmail,
  userName,
  targetId,
  gmailClient,
  generateDraft,
  upsertDraft,
  formatHistory,
}: {
  userId: string;
  userEmail: string;
  userName: string;
  targetId: string;
  gmailClient?: gmail_v1.Gmail;
  generateDraft: (params: {
    userName: string;
    incomingEmailBody: string;
    threadHistoryText: string;
    lastUserMessage: string;
  }) => Promise<string>;
  upsertDraft: (params: {
    userId: string;
    threadId: string;
    emailId?: string;
    draft: string;
    incomingEmailBody: string;
    threadHistory: ThreadHistoryEntry[];
    lastUserMessage: string;
    senderEmail?: string;
    senderName?: string;
    subject?: string;
  }) => Promise<void>;
  formatHistory: (historyEntries: ThreadHistoryEntry[]) => string;
}) {
  const gmail = gmailClient || (await getGmailClient(userId));
  const threadData = await fetchThread(gmail, targetId);
  const messages = threadData.messages || [];

  if (messages.length === 0) {
    throw new Error('Thread has no messages');
  }

  const threadDetails = extractThreadDetails(messages, userEmail);

  if (!threadDetails.incomingEmailBody) {
    throw new Error('No incoming email found in thread');
  }

  const draft = await generateDraft({
    userName,
    incomingEmailBody: threadDetails.incomingEmailBody,
    threadHistoryText: formatHistory(threadDetails.historyEntries),
    lastUserMessage: threadDetails.lastUserMessage || 'No prior message from user.',
  });

  await upsertDraft({
    userId,
    threadId: threadData.id || targetId,
    emailId: threadDetails.lastIncomingMessageId || threadData.id || targetId,
    draft,
    incomingEmailBody: threadDetails.incomingEmailBody,
    threadHistory: threadDetails.historyEntries,
    lastUserMessage: threadDetails.lastUserMessage,
    senderEmail: threadDetails.incomingSenderEmail,
    senderName: threadDetails.incomingSenderName,
    subject: threadDetails.incomingSubject,
  });

  return { draft, emailId: threadData.id || targetId };
}

