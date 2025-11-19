import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { gmail_v1 } from 'googleapis';
import { authOptions, getMeetingPrepUser } from '@/lib/meeting-prep/auth';
import {
  generateDraftForThread,
  getGmailClient,
  extractPlainBody,
  isUserMessage,
  extractEmail,
  fetchThread,
} from '@/app/api/generate-draft/route';

export const runtime = 'nodejs';

const MAX_THREADS = 5;
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const NO_REPLY_PATTERNS = ['no-reply', 'noreply', 'donotreply', 'notification', 'support', 'newsletter'];

export async function POST(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const meetingUser = await getMeetingPrepUser(session.user.email);
    if (!meetingUser) {
      return NextResponse.json({ error: 'Linked meeting prep user not found' }, { status: 404 });
    }

    const gmail = await getGmailClient(meetingUser.id);
    const threadsResponse = await gmail.users.threads.list({
      userId: 'me',
      maxResults: 25,
      q: '-in:spam -in:drafts newer_than:7d',
    });

    const threadRefs = threadsResponse.data.threads || [];
    let created = 0;

    for (const threadRef of threadRefs) {
      if (created >= MAX_THREADS) break;
      if (!threadRef.id) continue;

      const thread = await fetchThread(gmail, threadRef.id);
      const messages = thread.messages || [];
      if (messages.length === 0) continue;

      if (!isActionableThread(messages, session.user.email)) continue;

      try {
        await generateDraftForThread({
          userId: meetingUser.id,
          userEmail: session.user.email,
          userName: session.user.name || session.user.email,
          targetId: thread.id || threadRef.id,
          gmailClient: gmail,
        });
        created += 1;
      } catch (error) {
        console.error('[scan-inbox] Draft creation failed:', error);
      }
    }

    return NextResponse.json({ created });
  } catch (error: any) {
    console.error('[scan-inbox] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to scan inbox' },
      { status: 500 }
    );
  }
}

function isActionableThread(messages: gmail_v1.Schema$Message[], userEmail: string): boolean {
  const sorted = [...messages].sort((a, b) => Number(a.internalDate || 0) - Number(b.internalDate || 0));
  const normalizedUser = userEmail.toLowerCase();

  for (let i = sorted.length - 1; i >= 0; i--) {
    const message = sorted[i];
    const headers = message.payload?.headers || [];
    const fromHeader = headers.find((h) => h.name?.toLowerCase() === 'from')?.value || '';
    const senderEmail = extractEmail(fromHeader || '');

    if (isUserMessage(message, fromHeader, userEmail)) {
      continue; // we already replied
    }

    if (!isHumanSender(senderEmail)) continue;

    const body = extractPlainBody(message) || message.snippet || '';
    if (!looksLikeRequest(body)) continue;

    const messageAge = Date.now() - Number(message.internalDate || 0);
    if (messageAge < FOUR_HOURS_MS) continue;

    const laterMessages = sorted.slice(i + 1);
    const hasUserReplyAfter = laterMessages.some((msg) => isUserMessage(msg, getHeader(msg, 'From') || '', userEmail));
    if (hasUserReplyAfter) continue;

    return true;
  }

  return false;
}

function isHumanSender(email: string): boolean {
  if (!email) return false;
  return !NO_REPLY_PATTERNS.some((pattern) => email.includes(pattern));
}

function looksLikeRequest(body: string): boolean {
  if (!body) return false;
  const lower = body.toLowerCase();
  return (
    body.includes('?') ||
    lower.includes('can you') ||
    lower.includes('could you') ||
    lower.includes('please') ||
    lower.includes('let me know') ||
    lower.includes('need you')
  );
}

function getHeader(message: gmail_v1.Schema$Message, name: string): string | undefined {
  const headers = message.payload?.headers || [];
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value;
}


