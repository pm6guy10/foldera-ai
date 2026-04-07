import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runBriefLifecycle } from '../brief-service';
import { runDailyBrief, runDailySend } from '../daily-brief';

vi.mock('../daily-brief', () => ({
  runDailyBrief: vi.fn(),
  runDailySend: vi.fn(),
}));

const USER_ID = '33333333-3333-3333-3333-333333333333';

function makeGenerateResult(code: string, success = true) {
  return {
    date: '2026-03-24',
    message: 'generate message',
    results: [{ code, success, userId: USER_ID }],
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

function makeSendResult(code: string, success = true) {
  return {
    date: '2026-03-24',
    message: 'send message',
    results: [{ code, success, userId: USER_ID }],
    succeeded: success ? 1 : 0,
    total: 1,
  };
}

function makeBriefResult(generateCode: string, sendCode: string) {
  const generate = makeGenerateResult(generateCode);
  const { signalProcessing, ...generateWithoutSignal } = generate;
  return {
    date: '2026-03-24',
    ok: true,
    generate: generateWithoutSignal,
    send: makeSendResult(sendCode),
    signal_processing: signalProcessing,
  };
}

describe('runBriefLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls runDailyBrief with the provided userIds and returns normalized result', async () => {
    vi.mocked(runDailyBrief).mockResolvedValue(makeBriefResult('pending_approval_persisted', 'email_sent'));

    const { result, sendFallbackAttempted } = await runBriefLifecycle({ userIds: [USER_ID] });

    expect(runDailyBrief).toHaveBeenCalledWith({ userIds: [USER_ID] });
    expect(sendFallbackAttempted).toBe(false);
    expect(result.date).toBe('2026-03-24');
    expect(result.send.results[0].code).toBe('email_sent');
  });

  it('retries send when ensureSend is true and generate succeeded but send did not confirm delivery', async () => {
    vi.mocked(runDailyBrief).mockResolvedValue(makeBriefResult('pending_approval_persisted', 'no_generated_directive'));
    vi.mocked(runDailySend).mockResolvedValue(makeSendResult('email_sent'));

    const { result, sendFallbackAttempted } = await runBriefLifecycle({
      userIds: [USER_ID],
      ensureSend: true,
    });

    expect(runDailySend).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: [USER_ID], ensureSend: true }),
    );
    expect(sendFallbackAttempted).toBe(true);
    expect(result.send.results[0].code).toBe('email_sent');
  });

  it('does not retry send when generate produced an explicit no-send result', async () => {
    vi.mocked(runDailyBrief).mockResolvedValue(makeBriefResult('no_send_persisted', 'no_send_blocker_persisted'));

    const { result, sendFallbackAttempted } = await runBriefLifecycle({
      userIds: [USER_ID],
      ensureSend: true,
    });

    expect(runDailySend).not.toHaveBeenCalled();
    expect(sendFallbackAttempted).toBe(false);
    expect(result.send.results[0].code).toBe('no_send_blocker_persisted');
  });

  it('does not retry send when ensureSend is not set even if generate succeeded and send did not confirm', async () => {
    vi.mocked(runDailyBrief).mockResolvedValue(makeBriefResult('pending_approval_persisted', 'no_generated_directive'));

    const { sendFallbackAttempted } = await runBriefLifecycle({ userIds: [USER_ID] });

    expect(runDailySend).not.toHaveBeenCalled();
    expect(sendFallbackAttempted).toBe(false);
  });
});
