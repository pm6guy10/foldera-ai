import { afterEach, describe, expect, it } from 'vitest';
import { getDeployBuildLabel, getDeployRevision } from '../deploy-revision';

describe('deploy-revision', () => {
  const envSnapshot = { ...process.env };

  afterEach(() => {
    process.env = { ...envSnapshot };
  });

  it('returns nulls and build label local without Vercel env', () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    delete process.env.VERCEL_GIT_COMMIT_REF;
    delete process.env.VERCEL_DEPLOYMENT_ID;
    delete process.env.VERCEL_ENV;

    const rev = getDeployRevision();
    expect(rev).toEqual({
      git_sha: null,
      git_sha_short: null,
      git_ref: null,
      deployment_id: null,
      vercel_env: null,
    });
    expect(getDeployBuildLabel(rev)).toBe('local');
  });

  it('parses Vercel production deploy env', () => {
    process.env.VERCEL_GIT_COMMIT_SHA = 'abcdef1234567890deadbeef00';
    process.env.VERCEL_GIT_COMMIT_REF = 'main';
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_xyz';
    process.env.VERCEL_ENV = 'production';

    const rev = getDeployRevision();
    expect(rev.git_sha).toBe('abcdef1234567890deadbeef00');
    expect(rev.git_sha_short).toBe('abcdef1');
    expect(rev.git_ref).toBe('main');
    expect(rev.deployment_id).toBe('dpl_xyz');
    expect(rev.vercel_env).toBe('production');
    expect(getDeployBuildLabel(rev)).toBe('abcdef1');
  });

  it('normalizes vercel_env to known literals only', () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    process.env.VERCEL_ENV = 'preview';
    expect(getDeployRevision().vercel_env).toBe('preview');
    process.env.VERCEL_ENV = 'development';
    expect(getDeployRevision().vercel_env).toBe('development');
    process.env.VERCEL_ENV = 'bogus';
    expect(getDeployRevision().vercel_env).toBe(null);
  });
});
