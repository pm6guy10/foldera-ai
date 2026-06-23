import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runBriefLifecycle } from '../brief-service';
import { runDailyBrief } from '../daily-brief';
import type { DailyBriefUserResult, DailyBriefOrchestrationResult } from '../daily-brief-types';

vi.mock('../daily-brief', () => ({
  runDailyBrief: vi.fn(),
}));

const USER_ID = '33333333-3333-3333-3333-333333333333';

function makeGenerateResult(code: string, success = true) {
  return {
    date: '2026-03-24',
    message: 'generate message',
    results: [{ code: code as DailyBriefUserResult['code'], success, userId: USER_ID }],
    succeeded: success ? 1 : 0,
    total: 1,
    signalProcessing: {
      date: '2026-03-24',
      message: 'signal message',
      results: [{ code: 'no_unprocessed_signals', success: true, userId: USER_ID }],
      succeeded: 1,
      total: 1,
    },
  };
}

function makeBriefResult(generateCode: string) {
  const generate = makeGenerateResult(generateCode);
  const { signalProcessing, ...generateWithoutSignal } = generate;
  return {
    date: '2026-03-24',
    ok: true,
    generate: generateWithoutSignal,
    send: { date: '2026-03-24', message: 'Email send removed.', results: [], succeeded: 0, total: 0 },
    signal_processing: signalProcessing,
  } as DailyBriefOrchestrationResult;
}

describe('runBriefLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls runDailyBrief with the provided userIds and returns normalized result', async () => {
    vi.mocked(runDailyBrief).mockResolvedValue(makeBriefResult('pending_approval_persisted'));

    const { result, sendFallbackAttempted } = await runBriefLifecycle({ userIds: [USER_ID] });

    expect(runDailyBrief).toHaveBeenCalledWith({ userIds: [USER_ID] });
    expect(sendFallbackAttempted).toBe(false);
    expect(result.date).toBe('2026-03-24');
  });

  it('always returns sendFallbackAttempted=false (email send removed)', async () => {
    vi.mocked(runDailyBrief).mockResolvedValue(makeBriefResult('pending_approval_persisted'));

    const { sendFallbackAttempted } = await runBriefLifecycle({ userIds: [USER_ID] });

    expect(sendFallbackAttempted).toBe(false);
  });
});
