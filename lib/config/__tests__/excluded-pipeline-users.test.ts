import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  TEST_USER_ID,
  getExcludedPipelineUserIds,
  isExcludedPipelineUser,
} from '@/lib/config/constants';

// Budget-protecting guard: these accounts must never enter a paid pipeline loop.
// Owner directive 2026-06-26 ("kill micro1 email connect for good") — the micro1
// eval tester drained the shared Anthropic budget to $0 with zero owner value.
const MICRO1_EVAL_USER_ID = '398a8c82-d110-4dea-9b53-004d0f406149';

describe('excluded pipeline users', () => {
  const ORIGINAL = process.env.EXCLUDED_PIPELINE_USER_IDS;

  beforeEach(() => {
    delete process.env.EXCLUDED_PIPELINE_USER_IDS;
  });

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.EXCLUDED_PIPELINE_USER_IDS;
    else process.env.EXCLUDED_PIPELINE_USER_IDS = ORIGINAL;
  });

  it('always excludes the synthetic test user and the micro1 eval tester', () => {
    expect(isExcludedPipelineUser(TEST_USER_ID)).toBe(true);
    expect(isExcludedPipelineUser(MICRO1_EVAL_USER_ID)).toBe(true);
  });

  it('does not exclude a real owner/customer user id', () => {
    expect(isExcludedPipelineUser('2cbc1bab-8e0e-43b0-bf4a-9a0cd6b5d91f')).toBe(false);
  });

  it('treats null/undefined/empty as not excluded (never blocks a real loop by accident)', () => {
    expect(isExcludedPipelineUser(null)).toBe(false);
    expect(isExcludedPipelineUser(undefined)).toBe(false);
    expect(isExcludedPipelineUser('')).toBe(false);
  });

  it('is runtime-extensible via EXCLUDED_PIPELINE_USER_IDS (comma/space separated)', () => {
    process.env.EXCLUDED_PIPELINE_USER_IDS = 'aaaa1111-0000-0000-0000-000000000000, bbbb2222-0000-0000-0000-000000000000';
    expect(isExcludedPipelineUser('aaaa1111-0000-0000-0000-000000000000')).toBe(true);
    expect(isExcludedPipelineUser('bbbb2222-0000-0000-0000-000000000000')).toBe(true);
    // static exclusions still apply alongside the env-configured ones
    expect(getExcludedPipelineUserIds().has(MICRO1_EVAL_USER_ID)).toBe(true);
  });
});
