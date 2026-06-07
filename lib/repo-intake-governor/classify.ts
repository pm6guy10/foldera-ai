import type { ClassificationResult, IntakeClassification } from './schema';

const BUCKETS: Record<IntakeClassification, string> = {
  VISION: 'Product doctrine / owner vision',
  AUDIT_FINDING: 'Repo audit / source truth',
  ACTIVE_SEAM_COMMAND: 'Active seam command',
  BLOCKER_REPORT: 'Blocker report',
  BUSINESS_PLAN_UPDATE: 'Business plan / market direction',
  ARCHITECTURE_DOCTRINE: 'Architecture doctrine / command rail',
  PRODUCT_PROOF: 'Product proof',
  REPO_HYGIENE: 'Repo hygiene',
  LESSON_LEARNED: 'Lesson learned',
  REFERENCE_ONLY: 'Reference only',
  UNSAFE_EXPANSION: 'Unsafe expansion',
  OPEN_THREAD_CAPTURE: 'Open Threads capture',
};

function includesAny(input: string, terms: string[]): boolean {
  return terms.some((term) => input.includes(term));
}

export function classifyInput(rawInput: string): ClassificationResult {
  const input = rawInput.toLowerCase();
  let classification: IntakeClassification = 'OPEN_THREAD_CAPTURE';

  if (includesAny(input, ['run issue #166', 'execute the active', 'active command', 'active seam command'])) {
    classification = 'ACTIVE_SEAM_COMMAND';
  } else if (includesAny(input, ['blocker report', 'blocked:', 'ci failed', 'vercel did not', 'no live slack callback', 'missing the slack callback'])) {
    classification = 'BLOCKER_REPORT';
  } else if (includesAny(input, ['unsafe expansion', 'build landing', 'build the dashboard', 'live slack send', 'supabase schema', 'stripe billing', 'outreach scraper', 'customer-data automation', 'second active seam'])) {
    classification = 'UNSAFE_EXPANSION';
  } else if (includesAny(input, ["what's on my mind", 'not sure where', 'cannot tell whether', 'capture it first'])) {
    classification = 'OPEN_THREAD_CAPTURE';
  } else if (includesAny(input, ['repo hygiene', 'archive stale', 'delete stale', 'rename folders', 'ghost files'])) {
    classification = 'REPO_HYGIENE';
  } else if (includesAny(input, ['lesson learned', 'do not count', 'do not repeat'])) {
    classification = 'LESSON_LEARNED';
  } else if (includesAny(input, ['architecture doctrine', 'github source truth beats', 'command rail', 'repo must classify', 'labels, projects'])) {
    classification = 'ARCHITECTURE_DOCTRINE';
  } else if (includesAny(input, ['business plan', 'pricing', 'gtm', 'revenue', 'buyer', 'pilot-honest'])) {
    classification = 'BUSINESS_PLAN_UPDATE';
  } else if (includesAny(input, ['product proof', 'proof:', 'clicked done', 'state updated', 'workday state updated', 'source trail'])) {
    classification = 'PRODUCT_PROOF';
  } else if (includesAny(input, ['audit finding', 'repo contradiction', 'stale docs', 'source truth', 'active_handoff', 'foldera_build_order'])) {
    classification = 'AUDIT_FINDING';
  } else if (includesAny(input, ['duplicate', 'reference-only', 'reference only', 'already represented', 'repeats the'])) {
    classification = 'REFERENCE_ONLY';
  } else if (includesAny(input, ['vision', 'should become', 'should feel', 'product direction', 're-entry point'])) {
    classification = 'VISION';
  }

  return {
    classification,
    bucket: BUCKETS[classification],
  };
}
