/**
 * CI: fail if the daily_brief cron_complete heartbeat is missing.
 * Scheduled and manual workflow runs check today's expected UTC post-cron window
 * so late reruns still validate the same daily send without counting yesterday's success.
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_EXPECTED_CRON_HOUR_UTC = 11;
const DEFAULT_EXPECTED_CRON_MINUTE_UTC = 0;

export type HeartbeatWindow = {
  start: Date;
  end: Date;
  label: string;
};

export function getHeartbeatWindow(
  now: Date,
  options?: {
    expectedCronHourUtc?: number;
    expectedCronMinuteUtc?: number;
  },
): HeartbeatWindow {
  const expectedCronHourUtc = options?.expectedCronHourUtc ?? DEFAULT_EXPECTED_CRON_HOUR_UTC;
  const expectedCronMinuteUtc =
    options?.expectedCronMinuteUtc ?? DEFAULT_EXPECTED_CRON_MINUTE_UTC;
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      expectedCronHourUtc,
      expectedCronMinuteUtc,
      0,
      0,
    ),
  );

  return {
    start,
    end: now,
    label: `${start.toISOString()} -> ${now.toISOString()}`,
  };
}

export function isHeartbeatInWindow(
  createdAt: Date | string,
  window: HeartbeatWindow,
): boolean {
  const createdAtDate = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  return createdAtDate >= window.start && createdAtDate <= window.end;
}

async function main() {
  config({ path: resolve(process.cwd(), '.env.local') });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const now = new Date();
  const heartbeatWindow = getHeartbeatWindow(now, {
    expectedCronHourUtc: Number(
      process.env.PIPELINE_HEARTBEAT_EXPECTED_CRON_HOUR_UTC ??
        DEFAULT_EXPECTED_CRON_HOUR_UTC.toString(),
    ),
    expectedCronMinuteUtc: Number(
      process.env.PIPELINE_HEARTBEAT_EXPECTED_CRON_MINUTE_UTC ??
        DEFAULT_EXPECTED_CRON_MINUTE_UTC.toString(),
    ),
  });
  const startIso = heartbeatWindow.start.toISOString();
  const endIso = heartbeatWindow.end.toISOString();
  const supabase = createClient(url, key);

  console.log(
    `Checking daily_brief cron_complete window: ${heartbeatWindow.label} UTC`,
  );

  const { count, error } = await supabase
    .from('pipeline_runs')
    .select('id', { count: 'exact', head: true })
    .eq('phase', 'cron_complete')
    .eq('invocation_source', 'daily_brief')
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  if (error) {
    console.error('heartbeat query failed:', error.message);
    process.exit(1);
  }

  if (!count || count < 1) {
    console.error(
      `PIPELINE HEARTBEAT FAIL: no daily_brief cron_complete in UTC window ${heartbeatWindow.label}`,
    );
    process.exit(1);
  }

  console.log(`OK: daily_brief cron_complete count=${count} in UTC window ${heartbeatWindow.label}`);
}

const isDirectExecution =
  typeof process.argv[1] === 'string' &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
