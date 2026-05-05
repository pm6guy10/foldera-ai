/**
 * Read-only winner autopsy.
 *
 * Uses current owner Supabase state plus the local scorer/generator ranking
 * path. It never calls paid models, sends email, or mutates production data.
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

import { OWNER_USER_ID } from '../lib/auth/constants';
import { decryptWithStatus } from '../lib/encryption';

config({ path: resolve(process.cwd(), '.env.local') });
process.env.ALLOW_PAID_LLM = 'false';
process.env.ALLOW_PROD_PAID_LLM = 'false';

type FindingClass = 'current_blocker' | 'adjacent_risk' | 'future_backlog';

interface AutopsyFinding {
  classification: FindingClass;
  finding: string;
  evidence: string;
  smallest_next_move: string;
}

function ageHours(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return null;
  return Math.round((now - ts) / (1000 * 60 * 60));
}

function classifyProviderFreshness(row: {
  provider: string;
  last_synced_at: string | null;
  disconnected_at: string | null;
}) {
  const hours = ageHours(row.last_synced_at);
  const stale = row.disconnected_at != null || hours == null || hours > 48;
  return {
    provider: row.provider,
    last_synced_at: row.last_synced_at,
    age_hours: hours,
    disconnected: row.disconnected_at != null,
    stale,
    scoring_effect: stale
      ? 'may support context only; cannot manufacture urgency or relationship-silence winners'
      : 'fresh enough for currentness support',
  };
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = (process.env.AUDIT_USER_ID || process.env.OWNER_USER_ID || OWNER_USER_ID || '').trim();
  if (!url || !key || !userId) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or owner user id.');
    process.exit(1);
  }

  const db = createClient(url, key);
  const [{ scoreOpenLoops }, { selectRankedCandidates }] = await Promise.all([
    import('../lib/briefing/scorer'),
    import('../lib/briefing/generator'),
  ]);

  const [{ data: tokenRows, error: tokenError }, { data: signalRows, error: signalError }, { data: actionRows, error: actionError }] =
    await Promise.all([
      db
        .from('user_tokens')
        .select('provider, last_synced_at, disconnected_at')
        .eq('user_id', userId)
        .in('provider', ['google', 'microsoft']),
      db
        .from('tkg_signals')
        .select('id, source, type, content, occurred_at, created_at')
        .eq('user_id', userId)
        .gte('occurred_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
        .order('occurred_at', { ascending: false, nullsFirst: false })
        .limit(250),
      db
        .from('tkg_actions')
        .select('id, status, action_type, directive_text, confidence, generated_at, execution_result, skip_reason')
        .eq('user_id', userId)
        .order('generated_at', { ascending: false, nullsFirst: false })
        .limit(25),
    ]);

  if (tokenError) throw new Error(`user_tokens query failed: ${tokenError.message}`);
  if (signalError) throw new Error(`tkg_signals query failed: ${signalError.message}`);
  if (actionError) throw new Error(`tkg_actions query failed: ${actionError.message}`);

  const decryptSamples = (signalRows ?? []).map((row) => {
    const decrypted = decryptWithStatus(String(row.content ?? ''));
    return {
      id: row.id,
      source: row.source,
      type: row.type,
      occurred_at: row.occurred_at,
      used_fallback: decrypted.usedFallback,
      legacy_key: decrypted.decryptedWithLegacyKey === true,
    };
  });
  const decryptFallbackRows = decryptSamples.filter((row) => row.used_fallback);
  const providerFreshness = (tokenRows ?? []).map(classifyProviderFreshness);

  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  let scored: Awaited<ReturnType<typeof scoreOpenLoops>>;
  try {
    console.log = () => {};
    console.info = () => {};
    console.warn = () => {};
    scored = await scoreOpenLoops(userId, { pipelineDryRun: true });
  } finally {
    console.log = originalLog;
    console.info = originalInfo;
    console.warn = originalWarn;
  }
  const latestAction = actionRows?.[0] ?? null;
  const guardrails = {
    approvedRecently: (actionRows ?? []).filter((row) => ['approved', 'executed', 'sent', 'pending_approval'].includes(String(row.status))),
    skippedRecently: (actionRows ?? []).filter((row) => row.skip_reason != null),
  } as any;

  const findings: AutopsyFinding[] = [];
  let selection: ReturnType<typeof selectRankedCandidates> | null = null;
  let verdict: 'selected' | 'no_safe_artifact_today' = 'no_safe_artifact_today';
  if (scored.outcome !== 'no_valid_action') {
    selection = selectRankedCandidates(scored.topCandidates ?? [scored.winner], guardrails, { now: new Date() });
    const selected = selection.ranked.find((entry) => !entry.disqualified) ?? null;
    verdict = selected ? 'selected' : 'no_safe_artifact_today';
  }

  for (const provider of providerFreshness) {
    if (provider.stale) {
      findings.push({
        classification: 'adjacent_risk',
        finding: `${provider.provider}_provider_stale`,
        evidence: `${provider.provider} last_synced_at=${provider.last_synced_at ?? 'null'} age_hours=${provider.age_hours ?? 'unknown'}`,
        smallest_next_move: 'Refresh or repair provider sync before trusting urgency from stale mail evidence.',
      });
    }
  }
  if (decryptFallbackRows.length > 0) {
    findings.push({
      classification: 'current_blocker',
      finding: 'decrypt_fallback_rows_at_candidate_input',
      evidence: decryptFallbackRows.slice(0, 5).map((row) => `${row.id}:${row.source}:${row.type}`).join(', '),
      smallest_next_move: 'Quarantine fallback rows before candidate scoring and replay winner selection.',
    });
  }

  const positiveContract = selection?.winnerQualityTrace?.positive_winner_contract ?? null;
  const viablePositiveCount = positiveContract?.viable_tier_1_or_2_count ?? 0;
  const selectedTier = positiveContract?.selected_tier ?? null;
  const contractViolation = viablePositiveCount > 0 && selectedTier === 'tier_3';
  if (contractViolation) {
    findings.push({
      classification: 'current_blocker',
      finding: 'tier_3_winner_beat_viable_positive_candidate',
      evidence: JSON.stringify(positiveContract),
      smallest_next_move: 'Fix ranking so tier-1/tier-2 artifactable candidates reserve attempts before tier-3 risk/silence.',
    });
  }

  const report = {
    generated_at: new Date().toISOString(),
    user_id: userId,
    verdict,
    data_health: {
      provider_freshness: providerFreshness,
      decrypt_sample_count: decryptSamples.length,
      decrypt_fallback_count: decryptFallbackRows.length,
      decrypt_legacy_key_count: decryptSamples.filter((row) => row.legacy_key).length,
      decrypt_quarantine_required: decryptFallbackRows.length > 0,
    },
    latest_action: latestAction
      ? {
          id: latestAction.id,
          generated_at: latestAction.generated_at,
          status: latestAction.status,
          action_type: latestAction.action_type,
          directive_text: String(latestAction.directive_text ?? '').slice(0, 240),
        }
      : null,
    current_selection: selection
      ? {
          selected: selection.ranked.find((entry) => !entry.disqualified)
            ? {
                id: selection.ranked.find((entry) => !entry.disqualified)?.candidate.id,
                title: selection.ranked.find((entry) => !entry.disqualified)?.candidate.title,
                note: selection.ranked.find((entry) => !entry.disqualified)?.note,
              }
            : null,
          positive_winner_contract: positiveContract,
          taste_examples_used: selection.winnerQualityTrace?.taste_examples_used ?? null,
          candidate_artifactability: selection.winnerQualityTrace?.candidate_artifactability ?? [],
          good_candidate_blockers: selection.winnerQualityTrace?.good_candidate_blockers ?? [],
        }
      : {
          selected: null,
          positive_winner_contract: null,
          no_valid_action_reason: scored.outcome === 'no_valid_action' ? scored.reason : null,
        },
    future_findings: findings,
  };

  console.log(JSON.stringify(report, null, 2));
  if (contractViolation || decryptFallbackRows.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
