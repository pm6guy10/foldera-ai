import { beforeEach, describe, expect, it, vi } from 'vitest';

const insertMock = vi.fn();
const encryptMock = vi.fn((value: string) => `enc:${value}`);

vi.mock('@/lib/db/client', () => ({
  createServerClient: () => ({
    from: () => ({
      insert: insertMock,
    }),
  }),
}));

vi.mock('@/lib/encryption', () => ({
  encrypt: encryptMock,
}));

async function loadModule() {
  vi.resetModules();
  return import('@/lib/signals/directive-history-signal');
}

describe('persistDirectiveHistorySignal', () => {
  beforeEach(() => {
    insertMock.mockReset();
    encryptMock.mockClear();
    vi.restoreAllMocks();
  });

  it('silently disables directive-history inserts after stale signal constraint failures', async () => {
    insertMock.mockResolvedValueOnce({
      error: {
        code: '23514',
        message: 'new row for relation "tkg_signals" violates check constraint "tkg_signals_source_check"',
      },
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { persistDirectiveHistorySignal } = await loadModule();

    await persistDirectiveHistorySignal({
      userId: 'user-1',
      actionId: 'action-1',
      directiveText: 'Confirm the packet owner today.',
      actionType: 'send_message',
      status: 'pending_approval',
    });
    await persistDirectiveHistorySignal({
      userId: 'user-1',
      actionId: 'action-2',
      directiveText: 'Confirm the packet owner today.',
      actionType: 'send_message',
      status: 'pending_approval',
    });

    expect(warnSpy).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it('still warns on unexpected insert failures', async () => {
    insertMock.mockResolvedValueOnce({
      error: {
        code: '500',
        message: 'network timeout',
      },
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { persistDirectiveHistorySignal } = await loadModule();

    await persistDirectiveHistorySignal({
      userId: 'user-1',
      actionId: 'action-1',
      directiveText: 'Confirm the packet owner today.',
      actionType: 'send_message',
      status: 'pending_approval',
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[directive-history-signal] insert failed:',
      'network timeout',
    );
    expect(insertMock).toHaveBeenCalledTimes(1);
  });
});
