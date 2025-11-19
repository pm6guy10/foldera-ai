import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import Anthropic from '@anthropic-ai/sdk';
import { gmail_v1 } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { authOptions, getMeetingPrepUser } from '@/lib/meeting-prep/auth';
import {
  generateDraftForThread,
  ThreadHistoryEntry,
} from './utils';

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
      generateDraft: generateDraftResponse,
      upsertDraft,
      formatHistory: formatHistoryForPrompt,
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
    .filter((part: any) => part.type === 'text')
    .map((part: any) => (part.text ?? '').trim())
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


