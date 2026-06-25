/**
 * GET /api/cron/morning-pipeline
 *
 * Single scheduled morning cron entrypoint. Orchestrates the existing cron routes
 * in order so Vercel only needs one production cron definition:
 *   1. nightly-ops
 *   2. seed-from-scorer  (Slack Right Now card seed — replaces email daily-brief)
 *   3. trigger-runner    (evaluate fresh signals against seeded state → Slack card)
 *   4. daily-maintenance
 *
 * The underlying routes remain callable directly for manual/operator use.
 * daily-brief/route.ts is preserved for manual operator use but is no longer
 * scheduled — the Slack card (seed-from-scorer + trigger-runner) is the delivery surface.
 *
 * Intra-day delivery: /api/cron/ingest-and-deliver runs every 30 min and re-runs
 * seed-from-scorer + trigger-runner whenever fresh signals arrive, so cards land
 * within minutes of a new email_sent or file_modified event rather than waiting
 * for this 11:00 UTC sweep.
 *
 * Auth: CRON_SECRET Bearer token.
 * Schedule: 0 11 * * * (4am PT / 11:00 UTC)
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { apiErrorForRoute } from '@/lib/utils/api-error';
import { GET as runNightlyOps } from '@/app/api/cron/nightly-ops/route';
import { POST as runSeedFromScorer } from '@/app/api/workday-presence/seed-from-scorer/route';
import { POST as runTriggerRunner } from '@/app/api/cron/workday-presence-trigger-runner/route';
import { GET as runDailyMaintenance } from '@/app/api/cron/daily-maintenance/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type StageName = 'nightly_ops' | 'seed_from_scorer' | 'trigger_runner' | 'daily_maintenance';

type StageInvocation = {
  name: StageName;
  path: string;
  method: 'GET' | 'POST';
  handler: (request: NextRequest) => Promise<Response>;
};

type StageResult = {
  stage: StageName;
  path: string;
  status: number;
  ok: boolean;
  body: unknown;
};

const STAGE_INVOCATIONS: StageInvocation[] = [
  {
    name: 'nightly_ops',
    path: '/api/cron/nightly-ops',
    method: 'GET',
    handler: runNightlyOps,
  },
  {
    name: 'seed_from_scorer',
    path: '/api/workday-presence/seed-from-scorer',
    method: 'POST',
    handler: runSeedFromScorer,
  },
  {
    name: 'trigger_runner',
    path: '/api/cron/workday-presence-trigger-runner',
    method: 'POST',
    handler: runTriggerRunner,
  },
  {
    name: 'daily_maintenance',
    path: '/api/cron/daily-maintenance',
    method: 'GET',
    handler: runDailyMaintenance,
  },
];

function makeForwardHeaders(request: NextRequest) {
  const headers = new Headers();
  const authorization = request.headers.get('authorization');
  const cronSecret = request.headers.get('x-cron-secret');

  if (authorization) {
    headers.set('authorization', authorization);
  }

  if (cronSecret) {
    headers.set('x-cron-secret', cronSecret);
  }

  return headers;
}

function deriveStageOk(response: Response, body: unknown) {
  if (body && typeof body === 'object' && 'ok' in body) {
    return body.ok === true;
  }

  return response.ok;
}

async function invokeStage(
  stage: StageInvocation,
  request: NextRequest,
): Promise<StageResult> {
  const stageRequest = new NextRequest(new URL(stage.path, request.nextUrl.origin), {
    method: stage.method,
    headers: makeForwardHeaders(request),
  });

  // Per-stage isolation: a single stage that throws (rather than returning an
  // error Response) must NOT abort the sequential chain. Without this guard an
  // uncaught throw in nightly_ops would propagate out of the loop and silently
  // drop daily_brief (the value/delivery stage) and daily_maintenance for the
  // whole day. Catch here so each stage is recorded and the loop continues;
  // overall ok still goes false → 207. Fails safe: more stages run, never fewer.
  try {
    const response = await stage.handler(stageRequest);

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = { error: 'Non-JSON cron response' };
    }

    return {
      stage: stage.name,
      path: stage.path,
      status: response.status,
      ok: deriveStageOk(response, body),
      body,
    };
  } catch (error) {
    return {
      stage: stage.name,
      path: stage.path,
      status: 500,
      ok: false,
      body: {
        error: error instanceof Error ? error.message : String(error),
        threw: true,
      },
    };
  }
}

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  try {
    const startedAt = Date.now();
    const stageResults: StageResult[] = [];

    for (const stage of STAGE_INVOCATIONS) {
      stageResults.push(await invokeStage(stage, request));
    }

    const ok = stageResults.every((stage) => stage.ok);

    return NextResponse.json(
      {
        ok,
        cron_mode: 'single_morning_entrypoint',
        duration_ms: Date.now() - startedAt,
        stage_results: stageResults,
      },
      { status: ok ? 200 : 207 },
    );
  } catch (error) {
    return apiErrorForRoute(error, 'cron/morning-pipeline');
  }
}

export const GET = handler;
export const POST = handler;
