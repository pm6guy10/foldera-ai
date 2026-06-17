/**
 * GET /api/cron/morning-pipeline
 *
 * Single scheduled morning cron entrypoint. Orchestrates the existing cron routes
 * in order so Vercel only needs one production cron definition:
 *   1. nightly-ops
 *   2. daily-brief
 *   3. daily-maintenance
 *   4. workday-presence-trigger-runner
 *
 * Stage 4 is a zero-config daily floor for the Right Now heartbeat. The 15-min
 * heartbeat moved to a free external cron service hitting this same route
 * (issues #364/#366) because GitHub Actions is capped on this private repo and
 * every scheduled workflow instant-failed; there is also event-driven sync-now
 * firing (issue #262). But the external cron requires owner setup, and as of
 * issue #368 the brain had still fired zero real interventions in production.
 * Chaining the existing trigger-runner route into this already-paid,
 * already-running Vercel cron guarantees the runner gets at least one run per
 * day with NO additional owner setup — a floor under the external cron, not a
 * replacement. Function-call stage, NOT a new vercel.json cron entry, so the
 * hobby one-cron limit holds. Issue #368.
 *
 * The underlying routes remain callable directly for manual/operator use.
 *
 * Auth: CRON_SECRET Bearer token.
 * Schedule: 0 11 * * * (4am PT / 11:00 UTC)
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { apiErrorForRoute } from '@/lib/utils/api-error';
import { GET as runNightlyOps } from '@/app/api/cron/nightly-ops/route';
import { GET as runDailyBrief } from '@/app/api/cron/daily-brief/route';
import { GET as runDailyMaintenance } from '@/app/api/cron/daily-maintenance/route';
import { POST as runWorkdayPresenceTriggerRunner } from '@/app/api/cron/workday-presence-trigger-runner/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type StageName =
  | 'nightly_ops'
  | 'daily_brief'
  | 'daily_maintenance'
  | 'workday_presence_trigger_runner';

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
    name: 'daily_brief',
    path: '/api/cron/daily-brief',
    method: 'POST',
    handler: runDailyBrief,
  },
  {
    name: 'daily_maintenance',
    path: '/api/cron/daily-maintenance',
    method: 'GET',
    handler: runDailyMaintenance,
  },
  {
    // Runs last so it evaluates the freshest state after nightly ingestion has
    // refreshed signals/commitments. A 'quiet' runner outcome still returns
    // ok:true, so a silent day does not fail the pipeline; only a thrown
    // runner error degrades morning-pipeline to 207.
    name: 'workday_presence_trigger_runner',
    path: '/api/cron/workday-presence-trigger-runner',
    method: 'POST',
    handler: runWorkdayPresenceTriggerRunner,
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
