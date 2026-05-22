import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findForbiddenTokenSelects } from '../free-plan-gate';

describe('free plan gate', () => {
  it('flags token-value selects outside auth and sync paths', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'free-plan-gate-'));
    mkdirSync(join(repoRoot, 'lib', 'ops'), { recursive: true });
    mkdirSync(join(repoRoot, 'lib', 'auth'), { recursive: true });
    mkdirSync(join(repoRoot, 'lib', 'sync'), { recursive: true });
    writeFileSync(
      join(repoRoot, 'lib', 'ops', 'beta-readiness.ts'),
      "const q = supabase.from('user_tokens').select('provider, access_token, refresh_token');\n",
      'utf8',
    );
    writeFileSync(
      join(repoRoot, 'lib', 'auth', 'user-tokens.ts'),
      "const q = supabase.from('user_tokens').select('access_token, refresh_token');\n",
      'utf8',
    );
    writeFileSync(
      join(repoRoot, 'lib', 'sync', 'google-sync.ts'),
      "const q = supabase.from('user_tokens').select('access_token, refresh_token');\n",
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
    writeFileSync(
      join(repoRoot, 'lib', 'auth', 'user-tokens.ts'),
      "const q = supabase.from('user_tokens').select('access_token, refresh_token');\n",
      'utf8',
    );
    writeFileSync(
      join(repoRoot, 'lib', 'sync', 'google-sync.ts'),
      "const q = supabase.from('user_tokens').select('access_token, refresh_token');\n",
      'utf8',
    );

    expect(findForbiddenTokenSelects(repoRoot)).toEqual([]);
  });
});
