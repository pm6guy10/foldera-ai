#!/usr/bin/env node

import { config as loadEnv } from 'dotenv';
import { createServerClient } from '../lib/db/client';
import {
  countUnprocessedSignals,
  listUsersWithUnprocessedSignals,
} from '../lib/signals/signal-processor';

loadEnv({ path: '.env.local' });
loadEnv();

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1000;
const LOOKBACK_MS = 60 * 60 * 1000;
const MICROSOFT_SOURCES = new Set(['outlook', 'outlook_calendar']);
const PROCESS_ROUTE_URL = new URL(
  '/api/cron/process-unprocessed-signals',
  process.env.NEXTAUTH_URL ?? 'https://www.foldera.ai',
);

interface VerificationSummary {
  recentCommitments: number;
  recentEntities: number;
  recentSelfPatternUpdates: number;
  recentMarchMicrosoftCommitmentSignals: number;
}

interface BackfillBatchResponse {
  ok: boolean;
  processed: number;
  remaining: number;
  maxSignals: number;
}

async function main(): Promise<void> {
  const userIds = await listUsersWithUnprocessedSignals();
  if (userIds.length === 0) {
    console.log('No unprocessed extractable signals found.');
    return;
  }

  const initialCounts = await Promise.all(userIds.map((userId) => countUnprocessedSignals(userId)));
  const initialTotal = initialCounts.reduce((sum, count) => sum + count, 0);

  console.log(`Processing ${initialTotal} unprocessed extractable signals across ${userIds.length} user(s).`);

  let totalProcessed = 0;
  let remaining = initialTotal;
  let batchNumber = 0;

  while (remaining > 0) {
    batchNumber += 1;
    const batch = await processRemoteBatch();

    if (!batch.ok) {
      throw new Error(`Remote batch ${batchNumber} failed.`);
    }

    if (batch.processed === 0) {
      throw new Error(`No progress made in batch ${batchNumber}; ${batch.remaining} signal(s) still remain.`);
    }

    totalProcessed += batch.processed;
    remaining = batch.remaining;

    console.log(`Batch ${batchNumber}: processed ${batch.processed}, remaining ${remaining}.`);

    if (remaining > 0) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  const verification = await verifyRecentRows();

  console.log('Backfill complete.');
  console.log(
    JSON.stringify(
      {
        totalProcessed,
        verification,
      },
      null,
      2,
    ),
  );
}

async function verifyRecentRows(): Promise<VerificationSummary> {
  const supabase = createServerClient();
  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();

  const [commitmentsResult, entitiesResult, selfPatternsResult] = await Promise.all([
    supabase
      .from('tkg_commitments')
      .select('id, source_id, created_at')
      .eq('source', 'signal_extraction')
      .gte('created_at', since),
    supabase
      .from('tkg_entities')
      .select('id, created_at')
      .gte('created_at', since),
    supabase
      .from('tkg_entities')
      .select('id, patterns_updated_at')
      .eq('name', 'self')
      .gte('patterns_updated_at', since),
  ]);

  if (commitmentsResult.error) {
    throw new Error(`verification_commitments: ${commitmentsResult.error.message}`);
  }
  if (entitiesResult.error) {
    throw new Error(`verification_entities: ${entitiesResult.error.message}`);
  }
  if (selfPatternsResult.error) {
    throw new Error(`verification_patterns: ${selfPatternsResult.error.message}`);
  }

  const sourceIds = [...new Set((commitmentsResult.data ?? []).map((row) => row.source_id).filter(Boolean))];
  let recentMarchMicrosoftCommitmentSignals = 0;

  if (sourceIds.length > 0) {
    const signalsResult = await supabase
      .from('tkg_signals')
      .select('id, source, occurred_at')
      .in('id', sourceIds);

    if (signalsResult.error) {
      throw new Error(`verification_signals: ${signalsResult.error.message}`);
    }

    recentMarchMicrosoftCommitmentSignals = (signalsResult.data ?? []).filter((signal) => {
      if (!signal.occurred_at || !MICROSOFT_SOURCES.has(signal.source)) {
        return false;
      }

      const occurredAt = new Date(signal.occurred_at);
      return occurredAt.getUTCFullYear() === 2026 && occurredAt.getUTCMonth() === 2;
    }).length;
  }

  return {
    recentCommitments: commitmentsResult.data?.length ?? 0,
    recentEntities: entitiesResult.data?.length ?? 0,
    recentSelfPatternUpdates: selfPatternsResult.data?.length ?? 0,
    recentMarchMicrosoftCommitmentSignals,
  };
}

async function processRemoteBatch(): Promise<BackfillBatchResponse> {
  const url = new URL(PROCESS_ROUTE_URL);
  url.searchParams.set('maxSignals', String(BATCH_SIZE));

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.CRON_SECRET ?? ''}`,
    },
  });

  if (!response.ok) {
    throw new Error(`backfill_request_failed: ${response.status} ${response.statusText}`);
  }

  const body = (await response.json()) as BackfillBatchResponse;
  return body;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
