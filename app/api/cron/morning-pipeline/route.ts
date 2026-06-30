/**
 * GET /api/cron/morning-pipeline
 *
 * Single scheduled morning cron entrypoint. Orchestrates the existing cron routes
 * in order so Vercel only needs one production cron definition:
 *   1. seed-from-scorer        (Slack Right Now card seed — replaces email daily-brief)
 *   2. trigger-runner          (evaluate fresh signals against seeded state → Slack card)
 *   3. proactive-delivery      (#567 Phase B — surface a draft-backed winner with no
 *                                fresh signal of its own; never double-posts over trigger-runner)
 *   4. daily-maintenance
 *   5. renew-graph-subscriptions
 *   6. nightly-ops             (multi-user sync/signal-processing — runs LAST, best-effort)
 *
 * Card delivery runs FIRST and nightly-ops LAST on purpose (#567 Phase B — "cron is a
 * backup heartbeat, not the hinge", named after a live run where nightly-ops alone took
 * 221s, then >300s, and starved every stage after it including the scorer for a whole
 * day). nightly-ops' job — multi-user signal sync/processing, connector health,
 * behavioral graph, entity-trust-repair — is input prep that benefits a LATER tick (or
 * sooner via ingest-and-deliver / push), not a same-tick dependency of seed-from-scorer;
 * if it overruns the 300s budget now, it is the one stage that silently drops for the
 * day, never the value-delivery stages ahead of it.
 *
 * The underlying routes remain callable directly for manual/operator use.
 * daily-brief/route.ts is preserved for manual operator use but is no longer
 * scheduled — the Slack card (seed-from-scorer + trigger-runner + proactive-delivery)
 * is the delivery surface.
 *
 * Intra-day delivery: /api/cron/ingest-and-deliver runs every 30 min and re-runs the
 * same seed → trigger → proactive pipeline (via deliverWorkdayPresence) whenever fresh
 * signals arrive, so cards land within minutes of a new event rather than waiting for
 * this 11:00 UTC sweep.
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
import { POST as runProactiveDelivery } from '@/app/api/cron/workday-presence-proactive-delivery/route';
import { GET as runDailyMaintenance } from '@/app/api/cron/daily-maintenance/route';
import { GET as runRenewGraphSubscriptions } from '@/app/api/cron/renew-graph-subscriptions/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type StageName =
  | 'seed_from_scorer'
  | 'trigger_runner'
  | 'proactive_delivery'
  | 'daily_maintenance'
  | 'renew_graph_subscriptions'
  | 'nightly_ops';

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
    name: 'proactive_delivery',
    path: '/api/cron/workday-presence-proactive-delivery',
    method: 'POST',
    handler: runProactiveDelivery,
  },
  {
    name: 'daily_maintenance',
    path: '/api/cron/daily-maintenance',
    method: 'GET',
    handler: runDailyMaintenance,
  },
  {
    name: 'renew_graph_subscriptions',
    path: '/api/cron/renew-graph-subscriptions',
    method: 'GET',
    handler: runRenewGraphSubscriptions,
  },
  // Runs LAST and best-effort — see file header. If this overruns the remaining
  // budget, it is cut off; the value-delivery stages above already completed.
  {
    name: 'nightly_ops',
    path: '/api/cron/nightly-ops',
    method: 'GET',
    handler: runNightlyOps,
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
