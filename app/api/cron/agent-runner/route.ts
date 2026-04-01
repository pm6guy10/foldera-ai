/**
 * GET/POST /api/cron/agent-runner?agent=health_watchdog
 *
 * Runs one autonomous agent (DraftQueue staging). Auth: CRON_SECRET Bearer.
 * Scheduled from GitHub Actions (Vercel Hobby cron slot limit).
 */

import { NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import type { AgentJobId } from '@/lib/agents/constants';
import { runScheduledAgent } from '@/lib/agents/run-agent';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ALLOWED: Set<AgentJobId> = new Set([
  'health_watchdog',
  'ui_critic',
  'gtm_strategist',
  'distribution_finder',
  'retention_analyst',
  'self_optimizer',
]);

function parseJob(url: URL): AgentJobId | null {
  const raw = url.searchParams.get('agent')?.trim();
  if (!raw) return null;
  if (!ALLOWED.has(raw as AgentJobId)) return null;
  return raw as AgentJobId;
}

export async function GET(request: Request) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  const job = parseJob(new URL(request.url));
  if (!job) {
    return NextResponse.json({ error: 'Invalid or missing agent query param' }, { status: 400 });
  }

  const supabase = createServerClient();
  const result = await runScheduledAgent(supabase, job);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  return GET(request);
}
