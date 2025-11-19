import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import Anthropic from '@anthropic-ai/sdk';
import { google, gmail_v1 } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { authOptions, getGoogleAccessToken, getMeetingPrepUser } from '@/lib/meeting-prep/auth';
import { extractBody } from '@/lib/plugins/gmail/scanner';

export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Supabase environment variables are not configured.');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured.');
  }

  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  return anthropicClient;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { emailId, threadId } = body || {};

    const targetId: string | undefined = threadId || emailId;
    if (!targetId) {
      return NextResponse.json({ error: 'emailId (thread ID) is required' }, { status: 400 });
    }

    const meetingUser = await getMeetingPrepUser(session.user.email);
    if (!meetingUser) {
      return NextResponse.json({ error: 'Linked meeting prep user not found' }, { status: 404 });
    }

    const result = await generateDraftForThread({
      userId: meetingUser.id,
      userEmail: session.user.email,
      userName: session.user.name || session.user.email,
      targetId,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[generate-draft] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate draft' },
      { status: error.status || 500 }
    );
  }
}

export async function generateDraftForThread({
  userId,
  userEmail,
  userName,
  targetId,
  gmailClient,
}: {
  userId: string;
  userEmail: string;
  userName: string;
  targetId: string;
  gmailClient?: gmail_v1.Gmail;
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

  const draft = await generateDraftResponse({
    userName,
    incomingEmailBody: threadDetails.incomingEmailBody,
    threadHistoryText: formatHistoryForPrompt(threadDetails.historyEntries),
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

type ThreadHistoryEntry = {
  from: string;
  subject?: string;
  date: string;
  body: string;
};

type ThreadExtraction = {
  incomingEmailBody: string;
  lastIncomingMessageId?: string;
  historyEntries: ThreadHistoryEntry[];
  lastUserMessage: string;
  incomingSenderEmail?: string;
  incomingSenderName?: string;
  incomingSubject?: string;
};

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

export function extractEmail(value: string): string {
  const match = value.match(/<(.+?)>/);
  const raw = match ? match[1] : value;
  return raw.trim().toLowerCase();
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

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string | undefined {
  if (!headers) return undefined;
  const header = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value;
}

async function generateDraftResponse({
  userName,
  incomingEmailBody,
  threadHistoryText,
  lastUserMessage,
}: {
  userName: string;
  incomingEmailBody: string;
  threadHistoryText: string;
  lastUserMessage: string;
}): Promise<string> {
  const prompt = buildPrompt({ userName, incomingEmailBody, threadHistory: threadHistoryText, lastUserMessage });
  const anthropic = getAnthropicClient();

  const response = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 400,
    temperature: 0.4,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const textParts = response.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean);

  if (textParts.length === 0) {
    throw new Error('Draft generation returned no content');
  }

  return enforceWordLimit(textParts.join('\n').trim(), 150);
}

function formatHistoryForPrompt(historyEntries: ThreadHistoryEntry[]): string {
  if (historyEntries.length === 0) return 'No prior context.';
  return historyEntries
    .map((entry, idx) => {
      return [
        `EMAIL ${idx + 1}`,
        `From: ${entry.from}`,
        entry.subject ? `Subject: ${entry.subject}` : null,
        `Date: ${entry.date}`,
        '',
        entry.body,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n---\n\n');
}

function buildPrompt({
  userName,
  incomingEmailBody,
  threadHistory,
  lastUserMessage,
}: {
  userName: string;
  incomingEmailBody: string;
  threadHistory: string;
  lastUserMessage: string;
}): string {
  return `You are drafting an email reply for ${userName}.

You have THREE pieces of context:

1) The email that needs a response:
"${incomingEmailBody}"

2) The FULL thread history (chronological):
"${threadHistory}"

3) The last message the user sent (for tone & voice):
"${lastUserMessage}"

Write a short, clear, polite reply that:
- answers every question in the incoming email
- acknowledges any instructions or details
- provides missing information if the user already mentioned it earlier in the thread
- does NOT invent facts or commitments
- keeps the tone consistent with the user's last message
- stays under 150 words
- ends with a friendly closing
- avoids sounding robotic

If the email is vague, reply with:
"Thanks for reaching out — could you clarify what you need, and I’ll follow up?"`;
}

function enforceWordLimit(text: string, limit: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= limit) {
    return text;
  }
  return words.slice(0, limit).join(' ');
}

async function upsertDraft({
  userId,
  threadId,
  emailId,
  draft,
  incomingEmailBody,
  threadHistory,
  lastUserMessage,
  senderEmail,
  senderName,
  subject,
}: {
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
}) {
  const { data: existing, error: selectError } = await supabase
    .from('email_drafts')
    .select('id')
    .eq('user_id', userId)
    .eq('thread_id', threadId)
    .limit(1)
    .maybeSingle();

  if (selectError && selectError.code !== 'PGRST116') {
    throw new Error(`Failed to check existing drafts: ${selectError.message}`);
  }

  const payload = {
    user_id: userId,
    thread_id: threadId,
    email_id: emailId || null,
    draft,
    incoming_email_body: incomingEmailBody,
    thread_history: threadHistory,
    last_user_message: lastUserMessage || null,
    sender_email: senderEmail || null,
    sender_name: senderName || null,
    subject: subject || null,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase
      .from('email_drafts')
      .update(payload)
      .eq('id', existing.id);
    if (error) throw new Error(`Failed to update draft: ${error.message}`);
  } else {
    const { error } = await supabase.from('email_drafts').insert(payload);
    if (error) throw new Error(`Failed to save draft: ${error.message}`);
  }
}


