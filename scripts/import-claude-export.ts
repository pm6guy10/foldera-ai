#!/usr/bin/env tsx
/**
 * import-claude-export.ts
 *
 * Ingests a Claude.ai data export (conversations.json) into tkg_signals.
 * Each conversation's AI-generated summary becomes one signal of source='claude_chat'.
 * Signals are marked processed=false so the nightly signal processor runs
 * entity/commitment extraction on them.
 *
 * Usage:
 *   npx tsx scripts/import-claude-export.ts [path/to/conversations.json]
 *
 * Default path: data-unzip-preview/conversations.json
 * Requires: .env.local with ENCRYPTION_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createCipheriv, createHash, randomBytes } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

loadEnv({ path: '.env.local' });

const USER_ID = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
const BATCH_SIZE = 25;
const LOG_EVERY = 50;

// AES-256-GCM encryption — matches lib/encryption.ts exactly
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY env var is not set');

  const base64Key = Buffer.from(raw, 'base64');
  if (base64Key.length === 32) return base64Key;

  const hexKey = Buffer.from(raw, 'hex');
  if (hexKey.length === 32) return hexKey;

  throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes (base64 or 64-char hex)');
}

function encryptContent(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function contentHash(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

interface ClaudeMessage {
  uuid: string;
  text: string;
  sender: 'human' | 'assistant';
  created_at: string;
}

interface ClaudeConversation {
  uuid: string;
  name: string;
  summary?: string;
  created_at: string;
  updated_at: string;
  chat_messages?: ClaudeMessage[];
}

function buildSignalContent(conv: ClaudeConversation): string | null {
  // Prefer the AI-generated summary — it's already distilled behavioral signal text.
  if (conv.summary && conv.summary.trim().length > 20) {
    return `[${conv.name}]\n\n${conv.summary.trim()}`;
  }

  // Fallback: join first few human turns for short/unsummarised conversations.
  const humanTurns = (conv.chat_messages ?? [])
    .filter((m) => m.sender === 'human' && m.text && m.text.trim().length > 10)
    .slice(0, 5)
    .map((m) => m.text.trim())
    .join('\n');

  if (humanTurns.length > 20) {
    return `[${conv.name}]\n\n${humanTurns}`;
  }

  // Not enough content to be useful — skip.
  return null;
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  // Validate encryption key early so we don't fail mid-import
  getEncryptionKey();

  const filePath = path.resolve(
    process.cwd(),
    process.argv[2] ?? 'data-unzip-preview/conversations.json',
  );

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    console.error('Unzip the export first: Expand-Archive data-*.zip -DestinationPath data-unzip-preview');
    process.exit(1);
  }

  console.log(`Reading ${filePath} ...`);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const conversations: ClaudeConversation[] = JSON.parse(raw);
  console.log(`Loaded ${conversations.length} conversations`);

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Fetch existing content_hashes for this user to deduplicate
  const { data: existing, error: fetchError } = await supabase
    .from('tkg_signals')
    .select('content_hash')
    .eq('user_id', USER_ID)
    .eq('source', 'claude_conversation');

  if (fetchError) {
    console.error('Failed to fetch existing hashes:', fetchError.message);
    process.exit(1);
  }

  const existingHashes = new Set(
    (existing ?? []).map((r: { content_hash: string }) => r.content_hash),
  );
  console.log(`Found ${existingHashes.size} existing claude_chat signals (dedup check)`);

  // Build rows to insert
  const rows: {
    user_id: string;
    source: string;
    source_id: string;
    type: string;
    content: string;
    content_hash: string;
    author: string;
    occurred_at: string;
    processed: boolean;
  }[] = [];

  let skippedNoContent = 0;
  let skippedDuplicate = 0;

  for (const conv of conversations) {
    const plaintext = buildSignalContent(conv);

    if (!plaintext) {
      skippedNoContent++;
      continue;
    }

    const hash = contentHash(plaintext);

    if (existingHashes.has(hash)) {
      skippedDuplicate++;
      continue;
    }

    rows.push({
      user_id: USER_ID,
      source: 'claude_conversation',
      source_id: conv.uuid,
      type: 'chat_message',
      content: encryptContent(plaintext),
      content_hash: hash,
      author: 'self',
      occurred_at: conv.created_at,
      processed: false,
    });
  }

  console.log(
    `\nPrepared ${rows.length} new signals | skipped ${skippedDuplicate} duplicates, ${skippedNoContent} with no content`,
  );

  if (rows.length === 0) {
    console.log('Nothing to insert — all conversations already imported.');
    return;
  }

  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('tkg_signals').insert(batch);

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
      failed += batch.length;
    } else {
      inserted += batch.length;
    }

    const processed = i + batch.length;
    if (processed % LOG_EVERY === 0 || processed >= rows.length) {
      console.log(
        `Progress: ${Math.min(processed, rows.length)}/${rows.length} rows | inserted ${inserted} | failed ${failed}`,
      );
    }
  }

  console.log(`\nDone. Inserted: ${inserted} | Failed: ${failed} | Skipped: ${skippedDuplicate + skippedNoContent}`);
  console.log('\nNext step: the nightly signal processor (or "Generate Now" in the dashboard)');
  console.log('will run entity/commitment extraction on these signals automatically.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
