import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REQUIRED_PRODUCTION_REDIRECTS = [
  'https://www.foldera.ai/api/auth/callback/google',
  'https://foldera.ai/api/auth/callback/google',
  'https://www.foldera.ai/api/google/callback',
  'https://foldera.ai/api/google/callback',
];

const REQUIRED_LOCAL_REDIRECTS = [
  'http://localhost:3000/api/auth/callback/google',
  'http://localhost:3000/api/google/callback',
];

const REQUIRED_FRAGMENTS = [
  '/api/auth/callback/google',
  '/api/google/callback',
  'www.foldera.ai',
  'foldera.ai',
];

function readRepoFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('Google OAuth redirect configuration docs', () => {
  it('documents every required production and local Google redirect URI', () => {
    const docs = readRepoFile('docs/GOOGLE_OAUTH_REDIRECTS.md');

    for (const redirectUri of [...REQUIRED_PRODUCTION_REDIRECTS, ...REQUIRED_LOCAL_REDIRECTS]) {
      expect(docs).toContain(redirectUri);
    }

    expect(docs).toContain('redirect_uri_mismatch');
    expect(docs).toContain('Google Cloud Console');
  });

  it('keeps env examples pointing at both Google callback paths and both Foldera hosts', () => {
    const checkedFiles = ['docs/GOOGLE_OAUTH_REDIRECTS.md', '.env.example', '.env.local.example'];

    for (const relativePath of checkedFiles) {
      const text = readRepoFile(relativePath);
      for (const fragment of REQUIRED_FRAGMENTS) {
        expect(text, `${relativePath} should mention ${fragment}`).toContain(fragment);
      }
    }
  });

  it('keeps connector proof separate from real GATE_9 beta proof', () => {
    const docs = readRepoFile('docs/GOOGLE_OAUTH_REDIRECTS.md');
    const releaseGates = readRepoFile('docs/RELEASE_GATES.md');
    const betaChecklist = readRepoFile('docs/REAL_NON_OWNER_BETA_PROOF_CHECKLIST.md');

    expect(docs).toContain('/api/google/connect');
    expect(docs).toContain('/api/microsoft/connect');
    expect(docs).toContain('does not clear GATE_9_REAL_NON_OWNER_BETA');
    expect(releaseGates).toContain('GATE_9_REAL_NON_OWNER_BETA');
    expect(releaseGates).toContain('PRE_BETA_READINESS_THRESHOLD');
    expect(releaseGates).toContain('micro1 is Brandon-controlled and is internal owner-alias proof only');
    expect(releaseGates).toContain('must not tell the operator to recruit an external tester yet');
    expect(releaseGates).toContain('explicit tester feedback');
    expect(betaChecklist).toContain('No fabricated auth users.');
    expect(betaChecklist).toContain('The account connects Google or Microsoft only through the normal login and provider consent flow.');
  });
});
