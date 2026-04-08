/**
 * Runtime deploy identity for observability (Vercel injects these at build/deploy).
 * Local dev: all nulls / "local" — compare prod JSON to `git rev-parse HEAD`.
 */

export type DeployRevision = {
  /** Full commit SHA when running on Vercel (VERCEL_GIT_COMMIT_SHA). */
  git_sha: string | null;
  /** First 7 hex chars of git_sha, or null if unknown. */
  git_sha_short: string | null;
  /** Branch or ref (VERCEL_GIT_COMMIT_REF), or null. */
  git_ref: string | null;
  /** Vercel deployment id (VERCEL_DEPLOYMENT_ID), or null. */
  deployment_id: string | null;
  /** production | preview | development from VERCEL_ENV, or null. */
  vercel_env: 'production' | 'preview' | 'development' | null;
};

function trimEnv(key: string): string | null {
  const v = process.env[key]?.trim();
  return v && v.length > 0 ? v : null;
}

export function getDeployRevision(): DeployRevision {
  const sha = trimEnv('VERCEL_GIT_COMMIT_SHA');
  const git_sha_short = sha && sha.length >= 7 ? sha.slice(0, 7) : null;

  const rawEnv = trimEnv('VERCEL_ENV')?.toLowerCase() ?? null;
  const vercel_env =
    rawEnv === 'production' || rawEnv === 'preview' || rawEnv === 'development'
      ? rawEnv
      : null;

  return {
    git_sha: sha,
    git_sha_short,
    git_ref: trimEnv('VERCEL_GIT_COMMIT_REF'),
    deployment_id: trimEnv('VERCEL_DEPLOYMENT_ID'),
    vercel_env,
  };
}

/** One-line label for JSON `build` and monitors: short SHA or `local`. */
export function getDeployBuildLabel(rev: DeployRevision): string {
  return rev.git_sha_short ?? 'local';
}
