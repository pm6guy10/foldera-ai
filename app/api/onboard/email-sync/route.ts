/**
 * POST /api/onboard/email-sync
 *
 * Unified email sync for onboarding — handles both Google and Microsoft.
 * Detects provider from the NextAuth JWT token.provider field.
 *
 * 1. Reads access_token from the NextAuth JWT.
 * 2. Fetches last 30 days of SENT mail via Gmail API or Microsoft Graph.
 * 3. Batches all email content into extractFromConversation().
 * 4. Checks graph density: patterns >= 3 AND commitments >= 5 → "ready".
 * 5. Returns { status, patterns, commitments, emailsProcessed, provider }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { google } from 'googleapis';
import { authOptions } from '@/lib/auth/auth-options';
import { extractFromConversation } from '@/lib/extraction/conversation-extractor';
import { createServerClient } from '@/lib/db/client';


function extractEmailBody(payload: any): string {
  if (!payload) return '';
  if (payload.body?.data) {
    try {
      return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    } catch {
      return '';
    }
  }
  function searchParts(parts: any[]): string {
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        try {
          return Buffer.from(part.body.data, 'base64url').toString('utf-8');
        } catch {}
      }
      if (part.parts) {
        const found = searchParts(part.parts);
        if (found) return found;
      }
    }
    return '';
  }
  if (payload.parts) return searchParts(payload.parts);
  return '';
}

async function checkDensity(userId: string): Promise<{ patterns: number; commitments: number }> {
  const supabase = createServerClient();
  const [entityRes, commitmentsRes] = await Promise.all([
    supabase.from('tkg_entities').select('patterns').eq('user_id', userId).eq('name', 'self').maybeSingle(),
    supabase.from('tkg_commitments').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  const patterns = Object.keys((entityRes.data?.patterns as Record<string, unknown>) ?? {}).length;
  const commitments = commitmentsRes.count ?? 0;
  return { patterns, commitments };
}

async function syncGmail(accessToken: string, refreshToken: string | undefined, expiresAt: number | undefined): Promise<string[]> {
  const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  oauth2.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: expiresAt ? expiresAt * 1000 : undefined,
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2 });
  const thirtyDaysAgoSec = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);

  let messageIds: { id?: string | null }[] = [];
  try {
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: `in:sent after:${thirtyDaysAgoSec}`,
      maxResults: 25,
    });
    messageIds = list.data.messages ?? [];
  } catch (err) {
    console.error('[email-sync] Gmail list failed:', err);
  }

  const emailTexts: string[] = [];
  for (const { id } of messageIds) {
    if (!id) continue;
    try {
      const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
      const headers = msg.data.payload?.headers ?? [];
      const hdr = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
      const body = extractEmailBody(msg.data.payload).slice(0, 2000);
      const snippet = msg.data.snippet ?? '';
      emailTexts.push(
        [`[Sent: ${hdr('Date')}]`, `To: ${hdr('To')}`, `Subject: ${hdr('Subject') || '(no subject)'}`, body ? `Body:\n${body}` : `Preview: ${snippet}`].join('\n'),
      );
    } catch (err) {
      console.warn('[email-sync] skipping Gmail message', id, err);
    }
  }
  return emailTexts;
}

async function syncOutlook(accessToken: string): Promise<string[]> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const url = `https://graph.microsoft.com/v1.0/me/mailFolders/sentItems/messages?$top=25&$filter=sentDateTime ge ${thirtyDaysAgo}&$select=subject,toRecipients,sentDateTime,bodyPreview,body&$orderby=sentDateTime desc`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      console.error('[email-sync] Outlook fetch failed:', res.status, await res.text().catch(() => ''));
      return [];
    }
    const data = await res.json();
    const messages: any[] = data.value ?? [];

    return messages.map((msg: any) => {
      const to = (msg.toRecipients ?? []).map((r: any) => r.emailAddress?.address ?? '').join(', ');
      const body = (msg.body?.content ?? msg.bodyPreview ?? '').slice(0, 2000);
      return [`[Sent: ${msg.sentDateTime}]`, `To: ${to}`, `Subject: ${msg.subject || '(no subject)'}`, `Body:\n${body}`].join('\n');
    });
  } catch (err) {
    console.error('[email-sync] Outlook fetch error:', err);
    return [];
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const userId = session.user.id;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const accessToken = token?.accessToken as string | undefined;
  const refreshToken = token?.refreshToken as string | undefined;
  const expiresAt = token?.expiresAt as number | undefined;
  const provider = token?.provider as string | undefined;

  if (!accessToken) {
    return NextResponse.json({ error: 'No access token in session' }, { status: 401 });
  }

  // Fetch emails based on provider
  let emailTexts: string[];
  if (provider === 'azure-ad') {
    emailTexts = await syncOutlook(accessToken);
  } else {
    // Default to Google
    emailTexts = await syncGmail(accessToken, refreshToken, expiresAt);
  }

  // Extract from batched email content
  if (emailTexts.length > 0) {
    const batchText = emailTexts.join('\n\n---\n\n');
    try {
      await extractFromConversation(batchText, userId);
    } catch (err: any) {
      if (!err.message?.includes('already ingested')) {
        console.error('[email-sync] extraction error:', err.message);
      }
    }
  }

  const density = await checkDensity(userId);
  const isReady = density.patterns >= 3 && density.commitments >= 5;

  return NextResponse.json({
    status: isReady ? 'ready' : 'thin',
    patterns: density.patterns,
    commitments: density.commitments,
    emailsProcessed: emailTexts.length,
    provider: provider ?? 'google',
  });
}
