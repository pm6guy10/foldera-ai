/**
 * Beta readiness report (owner-side).
 *
 * Usage:
 *   npm run beta:readiness -- <user-id-or-email> [--json]
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import type { BetaReadinessReport } from '../lib/ops/beta-readiness.ts';
import { buildBetaReadinessReport } from '../lib/ops/beta-readiness.ts';

config({ path: resolve(process.cwd(), '.env.local') });

function parseArgs(argv: string[]): { ident: string | null; json: boolean } {
  const args = argv.slice(2);
  const json = args.includes('--json');
  const ident = args.find((a) => !a.startsWith('-')) ?? null;
  return { ident, json };
}

function formatIso(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return String(iso);
  return new Date(ms).toISOString();
}

function ageLabel(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return 'unknown';
  const deltaMs = Date.now() - ms;
  if (deltaMs < 0) return 'in_future';
  const hours = deltaMs / (60 * 60 * 1000);
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = hours / 24;
  return `${Math.round(days)}d ago`;
}

function providerDisplay(provider: string): string {
  if (provider === 'google') return 'google';
  if (provider === 'microsoft') return 'microsoft';
  return provider || 'unknown';
}

function buildHumanReport(report: BetaReadinessReport): string {
  const lines: string[] = [];
  lines.push('FOLDERA — OWNER BETA READINESS REPORT');
  lines.push(`Target: ${report.target}`);
  lines.push(`User exists: ${report.user_exists ? 'YES' : 'NO'}`);
  lines.push(`Account exists: ${report.account_exists ? 'YES' : 'NO'}`);
  if (report.account?.plan || report.account?.status) {
    lines.push(`Account: ${report.account?.plan ?? '—'} / ${report.account?.status ?? '—'}`);
  }

  lines.push('');
  lines.push(`Connected providers: ${report.connected_providers.length ? report.connected_providers.join(', ') : '—'}`);
  for (const p of report.providers ?? []) {
    lines.push(`- ${providerDisplay(p.provider)}`);
    lines.push(`  auth_valid: ${p.auth_valid ? 'YES' : 'NO'}${p.needs_reauth ? ' (reauth required)' : ''}${p.needs_reconnect ? ' (reconnect required)' : ''}`);
    lines.push(`  required_scopes_present: ${p.required_scopes_present ? 'YES' : 'NO'}`);
    if (p.missing_scopes?.length) {
      lines.push(`  missing_scopes: ${p.missing_scopes.join(', ')}`);
    }
    lines.push(`  last_synced_at: ${formatIso(p.last_synced_at)} (${ageLabel(p.last_synced_at)})`);
    lines.push(`  sync_recent: ${p.sync_recent ? 'YES' : 'NO'}`);
  }

  lines.push('');
  lines.push(`Recent signals (processed):`);
  lines.push(`- 14d: ${report.signals?.count_14d ?? 0}`);
  lines.push(`- 30d: ${report.signals?.count_30d ?? 0}`);

  lines.push('');
  lines.push(`Latest directive exists: ${report.latest_directive_exists ? 'YES' : 'NO'}`);
  if (report.latest_directive?.generated_at) {
    lines.push(`Latest directive at: ${formatIso(report.latest_directive.generated_at)} (${ageLabel(report.latest_directive.generated_at)})`);
    lines.push(`Latest action_type: ${report.latest_directive.action_type ?? '—'} / status: ${report.latest_directive.status ?? '—'}`);
  }
  lines.push(`Latest artifact exists: ${report.latest_artifact_exists ? 'YES' : 'NO'}`);
  lines.push(`Latest artifact valid: ${report.latest_artifact_valid ? 'YES' : 'NO'}`);
  if (report.latest_artifact_invalid_reason) {
    lines.push(`Artifact invalid reason: ${report.latest_artifact_invalid_reason}`);
  }

  lines.push('');
  lines.push(`VERDICT: ${report.verdict}`);
  if (report.blockers?.length) {
    lines.push('BLOCKERS:');
    for (const b of report.blockers) lines.push(`- ${b}`);
  } else {
    lines.push('BLOCKERS: —');
  }

  return lines.join('\n');
}

async function main() {
  const { ident, json } = parseArgs(process.argv);
  if (!ident) {
    console.error('Usage: npm run beta:readiness -- <user-id-or-email> [--json]');
    process.exit(2);
  }

  const report = await buildBetaReadinessReport(ident.trim());

  console.log(json ? JSON.stringify(report, null, 2) : buildHumanReport(report));
  process.exit(report.verdict === 'READY' ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error('[beta-readiness] fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
