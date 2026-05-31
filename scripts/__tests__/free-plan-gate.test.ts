import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateFreePlanEgressBudget,
  findForbiddenTokenSelects,
} from '../free-plan-gate';

describe('free plan gate', () => {
  it('flags token-value selects outside auth and sync paths', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'free-plan-gate-'));
    mkdirSync(join(repoRoot, 'lib', 'ops'), { recursive: true });
    mkdirSync(join(repoRoot, 'lib', 'auth'), { recursive: true });
    mkdirSync(join(repoRoot, 'lib', 'sync'), { recursive: true });
    writeFileSync(join(repoRoot, 'lib', 'ops', 'beta-readiness.ts'), "const q = x.from('user_tokens').select('provider, access_token, refresh_token');\n", 'utf8');
    writeFileSync(join(repoRoot, 'lib', 'auth', 'user-tokens.ts'), "const q = x.from('user_tokens').select('access_token, refresh_token');\n", 'utf8');
    writeFileSync(join(repoRoot, 'lib', 'sync', 'google-sync.ts'), "const q = x.from('user_tokens').select('access_token, refresh_token');\n", 'utf8');

    const hits = findForbiddenTokenSelects(repoRoot);

    expect(hits).toHaveLength(1);
    expect(hits[0]?.file).toBe(join('lib', 'ops', 'beta-readiness.ts'));
  });

  it('flags multiline token-value selects outside auth and sync paths', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'free-plan-gate-multi-'));
    mkdirSync(join(repoRoot, 'lib', 'ops'), { recursive: true });
    writeFileSync(
      join(repoRoot, 'lib', 'ops', 'beta-readiness.ts'),
      `const q = x
        .from('user_tokens')
        .select(
          'provider, email, access_token, refresh_token'
        );\n`,
      'utf8',
    );

    const hits = findForbiddenTokenSelects(repoRoot);

    expect(hits).toHaveLength(1);
    expect(hits[0]?.file).toBe(join('lib', 'ops', 'beta-readiness.ts'));
  });

  it('passes when token selects stay inside auth and sync paths', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'free-plan-gate-ok-'));
    mkdirSync(join(repoRoot, 'lib', 'auth'), { recursive: true });
    mkdirSync(join(repoRoot, 'lib', 'sync'), { recursive: true });
    writeFileSync(join(repoRoot, 'lib', 'auth', 'user-tokens.ts'), "const q = x.from('user_tokens').select('access_token, refresh_token');\n", 'utf8');
    writeFileSync(join(repoRoot, 'lib', 'sync', 'google-sync.ts'), "const q = x.from('user_tokens').select('access_token, refresh_token');\n", 'utf8');

    expect(findForbiddenTokenSelects(repoRoot)).toEqual([]);
  });

  it('passes egress budget when daily and monthly values are inside budget', () => {
    const result = evaluateFreePlanEgressBudget({ dailyMb: 100, projectedMonthlyGb: 4.2 });

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('fails egress budget when either measurement is missing', () => {
    expect(evaluateFreePlanEgressBudget({ projectedMonthlyGb: 4.2 }).ok).toBe(false);
    expect(evaluateFreePlanEgressBudget({ dailyMb: 100 }).ok).toBe(false);
  });

  it('fails egress budget above the safe daily threshold', () => {
    const result = evaluateFreePlanEgressBudget({ dailyMb: 150, projectedMonthlyGb: 4.9 });

    expect(result.ok).toBe(false);
    expect(result.failures[0]).toContain('125 MB/day');
  });

  it('fails egress budget above the monthly limit', () => {
    const result = evaluateFreePlanEgressBudget({ dailyMb: 100, projectedMonthlyGb: 5.1 });

    expect(result.ok).toBe(false);
    expect(result.failures[0]).toContain('5 GB/month');
  });
});
