/**
 * Observability-only: log global prior context next to send-worthiness (no user-facing scores).
 */

import type { ConvictionDirective } from '@/lib/briefing/types';
import { buildDirectiveMlBucketKey, mlBucketInputsFromWinnerLog } from '@/lib/ml/outcome-features';
import { fetchGlobalMlPriorMap } from '@/lib/ml/priors';
import { logStructuredEvent } from '@/lib/utils/structured-logger';

export async function logMlSendworthShadow(args: {
  userId: string;
  directive: ConvictionDirective;
  worthy: boolean;
  reason: string;
}): Promise<void> {
  const inputs = mlBucketInputsFromWinnerLog(args.directive.generationLog?.candidateDiscovery ?? null);
  if (!inputs) return;
  const bucketKey = buildDirectiveMlBucketKey(inputs);
  const priors = await fetchGlobalMlPriorMap();
  const globalPrior = priors.get(bucketKey) ?? null;

  logStructuredEvent({
    event: 'ml_sendworth_shadow',
    level: 'info',
    userId: args.userId,
    artifactType: null,
    generationStatus: 'quality_gate_context',
    details: {
      scope: 'ml_moat',
      worthy: args.worthy,
      reason: args.reason,
      bucket_key: bucketKey,
      global_prior: globalPrior,
    },
  });
}
