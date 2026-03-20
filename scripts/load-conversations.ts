#!/usr/bin/env tsx

import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

loadEnv({ path: '.env.local' });

const USER_ID = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';
const BATCH_SIZE = 10;
const LOG_EVERY = 25;

interface ConversationSignal {
  source: string;
  source_id: string;
  type: string;
  content: string;
  author: string;
  occurred_at: string;
  content_hash: string;
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const filePath = path.resolve(process.cwd(), 'conversation_signals.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const signals: ConversationSignal[] = JSON.parse(raw);

  console.log(`Loaded ${signals.length} signals from conversation_signals.json`);

  // Fetch all existing content_hashes for this user to deduplicate
  const { data: existing, error: fetchError } = await supabase
    .from('tkg_signals')
    .select('content_hash')
    .eq('user_id', USER_ID);

  if (fetchError) {
    console.error('Failed to fetch existing hashes:', fetchError.message);
    process.exit(1);
  }

  const existingHashes = new Set((existing ?? []).map((r: { content_hash: string }) => r.content_hash));
  console.log(`Found ${existingHashes.size} existing signals for this user (dedup check)`);

  const toInsert = signals.filter((s) => !existingHashes.has(s.content_hash));
  const skipped = signals.length - toInsert.length;
  console.log(`Inserting ${toInsert.length} new signals, skipping ${skipped} duplicates`);

  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);

    const rows = batch.map((s) => ({
      user_id: USER_ID,
      source: s.source,
      source_id: s.source_id,
      type: s.type,
      content: s.content,
      content_hash: s.content_hash,
      author: s.author,
      occurred_at: s.occurred_at,
      processed: true,
      processing_version: 1,
    }));

    const { error } = await supabase.from('tkg_signals').insert(rows);

    if (error) {
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error.message);
      failed += batch.length;
    } else {
      inserted += batch.length;
    }

    const processed = i + batch.length;
    if (processed % LOG_EVERY === 0 || processed === toInsert.length) {
      console.log(`Progress: ${processed}/${toInsert.length} processed, ${inserted} inserted, ${failed} failed`);
    }
  }

  console.log(`\nDone. Inserted: ${inserted}, Failed: ${failed}, Skipped (duplicates): ${skipped}`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
