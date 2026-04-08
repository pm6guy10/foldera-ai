import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isCronDailyBriefPipelineDryRunEnabled,
  resolveSettingsRunBriefPipelineDryRun,
} from '../prelaunch-spend';

describe('prelaunch-spend', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('explicit dry_run always dry', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('PROD_DEFAULT_PIPELINE_DRY_RUN', 'true');
    expect(
      resolveSettingsRunBriefPipelineDryRun({ explicitDryRun: true, useLlm: true }),
    ).toEqual({
      pipelineDryRun: true,
      paidLlmRequested: true,
      paidLlmEffective: false,
    });
  });

  it('prod default off: not dry unless dry_run', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(resolveSettingsRunBriefPipelineDryRun({ explicitDryRun: false, useLlm: false })).toEqual({
      pipelineDryRun: false,
      paidLlmRequested: false,
      paidLlmEffective: true,
    });
  });

  it('prod default on without allow: dry unless use_llm+allow', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('PROD_DEFAULT_PIPELINE_DRY_RUN', 'true');
    expect(resolveSettingsRunBriefPipelineDryRun({ explicitDryRun: false, useLlm: false })).toEqual({
      pipelineDryRun: true,
      paidLlmRequested: false,
      paidLlmEffective: false,
    });
    expect(resolveSettingsRunBriefPipelineDryRun({ explicitDryRun: false, useLlm: true })).toEqual({
      pipelineDryRun: true,
      paidLlmRequested: true,
      paidLlmEffective: false,
    });
    vi.stubEnv('ALLOW_PROD_PAID_LLM', 'true');
    expect(resolveSettingsRunBriefPipelineDryRun({ explicitDryRun: false, useLlm: true })).toEqual({
      pipelineDryRun: false,
      paidLlmRequested: true,
      paidLlmEffective: true,
    });
  });

  it('non-Vercel production: PROD_DEFAULT ignored', () => {
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('PROD_DEFAULT_PIPELINE_DRY_RUN', 'true');
    expect(resolveSettingsRunBriefPipelineDryRun({ explicitDryRun: false, useLlm: false })).toEqual({
      pipelineDryRun: false,
      paidLlmRequested: false,
      paidLlmEffective: true,
    });
  });

  it('isCronDailyBriefPipelineDryRunEnabled reads env', () => {
    expect(isCronDailyBriefPipelineDryRunEnabled()).toBe(false);
    vi.stubEnv('CRON_DAILY_BRIEF_PIPELINE_DRY_RUN', 'true');
    expect(isCronDailyBriefPipelineDryRunEnabled()).toBe(true);
  });
});
