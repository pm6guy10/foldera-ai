/**
 * POST /api/onboard/gmail-sync
 *
 * Called by /start/processing immediately after Google OAuth.
 * 1. Reads access_token from the NextAuth JWT (no integrations table needed).
 * 2. Fetches last 30 days of SENT mail via Gmail API (up to 25 messages).
 * 3. Batches all email content into a single extractFromConversation() call.
 * 4. Checks graph density: patterns >= 3 AND commitments >= 5 → "ready".
 * 5. Returns { status, patterns, commitments, emailsProcessed }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { google } from 'googleapis';
import { authOptions } from '@/lib/auth/auth-options';
import { extractFromConversation } from '@/lib/extraction/conversation-extractor';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/** Recursively search MIME parts for text/plain body content. */
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

  if (payload.parts) {
    return searchParts(payload.parts);
  }

  return '';
}

/** Count patterns (JSONB keys) and commitments for a user. */
async function checkDensity(userId: string): Promise<{ patterns: number; commitments: number }> {
  const supabase = getSupabase();

  const [entityRes, commitmentsRes] = await Promise.all([
    supabase
      .from('tkg_entities')
      .select('patterns')
      .eq('user_id', userId)
      .eq('name', 'self')
      .maybeSingle(),
    supabase
      .from('tkg_commitments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
  ]);

  const patterns = Object.keys(
    (entityRes.data?.patterns as Record<string, unknown>) ?? {},
  ).length;
  const commitments = commitmentsRes.count ?? 0;

  return { patterns, commitments };
}

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const userId = session.user.id;

  // Read access_token from the JWT directly so we don't depend on the
  // integrations table (which stores under INGEST_USER_ID, not the new user's sub).
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const accessToken = token?.accessToken as string | undefined;

  if (!accessToken) {
    return NextResponse.json({ error: 'No Google access token in session' }, { status: 401 });
  }

  // ── Gmail client ────────────────────────────────────────────────────────
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth2.setCredentials({
    access_token: accessToken,
    refresh_token: token?.refreshToken as string | undefined,
    expiry_date: token?.expiresAt
      ? (token.expiresAt as number) * 1000 // expiresAt is seconds → ms
      : undefined,
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2 });

  // ── Fetch sent mail (last 30 days) ──────────────────────────────────────
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
    console.error('[gmail-sync] list failed:', err);
    // Continue — the density check will show "thin" so user can paste
  }

  // ── Fetch individual messages ────────────────────────────────────────────
  const emailTexts: string[] = [];

  for (const { id } of messageIds) {
    if (!id) continue;
    try {
      const msg = await gmail.users.messages.get({
        userId: 'me',
        id,
        format: 'full',
      });

      const headers = msg.data.payload?.headers ?? [];
      const hdr = (name: string) =>
        headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';

      const body = extractEmailBody(msg.data.payload).slice(0, 2000);
      const snippet = msg.data.snippet ?? '';

      emailTexts.push(
        [
          `[Sent: ${hdr('Date')}]`,
          `To: ${hdr('To')}`,
          `Subject: ${hdr('Subject') || '(no subject)'}`,
          body ? `Body:\n${body}` : `Preview: ${snippet}`,
        ].join('\n'),
      );
    } catch (err) {
      console.warn('[gmail-sync] skipping message', id, err);
    }
  }

  // ── Extract from batched email content ──────────────────────────────────
  if (emailTexts.length > 0) {
    const batchText = emailTexts.join('\n\n---\n\n');
    try {
      await extractFromConversation(batchText, userId);
    } catch (err: any) {
      if (!err.message?.includes('already ingested')) {
        console.error('[gmail-sync] extraction error:', err.message);
      }
      // If already ingested, the existing data is fine — continue to density check
    }
  }

  // ── Density check ───────────────────────────────────────────────────────
  const density = await checkDensity(userId);
  const isReady = density.patterns >= 3 && density.commitments >= 5;

  return NextResponse.json({
    status: isReady ? 'ready' : 'thin',
    patterns: density.patterns,
    commitments: density.commitments,
    emailsProcessed: emailTexts.length,
  });
}
