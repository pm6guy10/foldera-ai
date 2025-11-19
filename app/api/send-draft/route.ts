import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { google, gmail_v1 } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { authOptions, getMeetingPrepUser, getGoogleAccessToken } from '@/lib/meeting-prep/auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Supabase environment variables are not configured.');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, draft: overrideDraft } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'Draft id required' }, { status: 400 });
    }

    const meetingUser = await getMeetingPrepUser(session.user.email);
    if (!meetingUser) {
      return NextResponse.json({ error: 'Linked meeting prep user not found' }, { status: 404 });
    }

    const { data: draftRecord, error } = await supabase
      .from('email_drafts')
      .select('*')
      .eq('id', id)
      .eq('user_id', meetingUser.id)
      .single();

    if (error || !draftRecord) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    }

    const emailBody = (overrideDraft || draftRecord.draft || '').trim();
    if (!emailBody) {
      return NextResponse.json({ error: 'Draft text is empty' }, { status: 400 });
    }

    if (!draftRecord.sender_email) {
      return NextResponse.json({ error: 'Draft missing recipient' }, { status: 400 });
    }

    const gmail = await getGmailClient(meetingUser.id);

    const replyHeaders = await getReplyHeaders(gmail, draftRecord.email_id);
    const finalSubject = normalizeSubject(draftRecord.subject);

    const rawMessage = buildEmailMessage({
      to: [draftRecord.sender_email],
      cc: undefined,
      subject: finalSubject,
      body: emailBody,
      inReplyTo: replyHeaders.inReplyTo,
      references: replyHeaders.references,
    });

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawMessage,
        threadId: draftRecord.thread_id || undefined,
      },
    });

    await supabase.from('email_drafts').delete().eq('id', draftRecord.id);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[send-draft] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send draft' },
      { status: 500 }
    );
  }
}

async function getGmailClient(userId: string) {
  const accessToken = await getGoogleAccessToken(userId);
  const oauthClient = new google.auth.OAuth2();
  oauthClient.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth: oauthClient });
}

async function getReplyHeaders(
  gmail: gmail_v1.Gmail,
  emailId?: string | null
): Promise<{ inReplyTo?: string; references?: string }> {
  if (!emailId) {
    return {};
  }

  try {
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: emailId,
      format: 'metadata',
      metadataHeaders: ['Message-ID', 'References'],
    });
    const headers = response.data.payload?.headers || [];
    const messageId = getHeader(headers, 'Message-ID');
    const references = getHeader(headers, 'References');
    return {
      inReplyTo: messageId,
      references: references || messageId,
    };
  } catch (error) {
    console.warn('[send-draft] Unable to fetch reply headers:', error);
    return {};
  }
}

function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string | undefined {
  if (!headers) return undefined;
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value;
}

function normalizeSubject(subject?: string | null): string {
  if (!subject) {
    return 'Re: (no subject)';
  }
  return subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`;
}

function buildEmailMessage(params: {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const lines: string[] = [];
  lines.push(`To: ${params.to.join(', ')}`);
  if (params.cc && params.cc.length > 0) {
    lines.push(`Cc: ${params.cc.join(', ')}`);
  }
  lines.push(`Subject: ${params.subject}`);
  lines.push('Content-Type: text/plain; charset=utf-8');
  lines.push('Content-Transfer-Encoding: 7bit');

  if (params.inReplyTo) {
    lines.push(`In-Reply-To: ${params.inReplyTo}`);
  }
  if (params.references) {
    lines.push(`References: ${params.references}`);
  }

  lines.push('');
  lines.push(params.body);

  const email = lines.join('\r\n');
  return Buffer.from(email)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}


