// DEV ONLY — owner-gated signal ingestion endpoint
// Accepts raw conversation signals, encrypts content server-side, inserts into tkg_signals.
// Requires ALLOW_DEV_ROUTES=true and an owner session.

import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { createServerClient } from '@/lib/db/client';
import { encrypt } from '@/lib/encryption';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface RawSignal {
  source: string;
  source_id: string;
  type: string;
  content: string;
  author: string;
  occurred_at: string;
  content_hash: string;
}

const CHUNK_SIZE = 50;

export async function POST(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.userId !== OWNER_USER_ID) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { signals?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body.signals)) {
    return NextResponse.json({ error: 'signals must be an array' }, { status: 400 });
  }

  const signals = body.signals as RawSignal[];
  const supabase = createServerClient();
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < signals.length; i += CHUNK_SIZE) {
    const chunk = signals.slice(i, i + CHUNK_SIZE);
    const rows = chunk.map((s) => ({
      user_id: auth.userId,
      source: s.source,
      source_id: s.source_id,
      type: s.type,
      content: encrypt(s.content),
      content_hash: s.content_hash,
      author: s.author,
      occurred_at: s.occurred_at,
      processed: false,
    }));

    const { error } = await supabase.from('tkg_signals').insert(rows);
    if (error) {
      errors += chunk.length;
      console.warn('[ingest-signals] batch insert error:', error.message);
    } else {
      inserted += chunk.length;
    }
  }

  return NextResponse.json({ inserted, errors });
}
