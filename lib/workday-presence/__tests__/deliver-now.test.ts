import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockSeedFromScorerForUser = vi.fn();
const mockMaybeRunTriggerRunner = vi.fn();
const mockMaybeDeliverProactiveWinner = vi.fn();

vi.mock('@/lib/workday-presence/seed-from-scorer-core', () => ({
  seedFromScorerForUser: (...args: unknown[]) => mockSeedFromScorerForUser(...args),
}));

vi.mock('@/lib/workday-presence/trigger-runner', () => ({
  maybeRunWorkdayPresenceTriggerRunnerForUser: (...args: unknown[]) => mockMaybeRunTriggerRunner(...args),
}));

vi.mock('@/lib/workday-presence/proactive-delivery', () => ({
  maybeDeliverProactiveWinner: (...args: unknown[]) => mockMaybeDeliverProactiveWinner(...args),
}));

describe('deliverWorkdayPresence — isAutomatedTrigger exemption from the manual-call budget (#567)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSeedFromScorerForUser.mockResolvedValue({ seeded: true, payload: {}, state: null });
    mockMaybeRunTriggerRunner.mockResolvedValue({ started: false, reason: 'not_owner' });
    mockMaybeDeliverProactiveWinner.mockResolvedValue({ started: false, reason: 'not_owner' });
  });

  it("a 'push' call is automated by default — exempt from the manual budget even with no explicit flag (graph-webhook never has to remember to set it)", async () => {
    const { deliverWorkdayPresence } = await import('../deliver-now');

    await deliverWorkdayPresence('user-1', {
      trigger: 'push',
      syncDelta: { gmail: 1, calendar: 0, drive: 0 },
    });

    expect(mockSeedFromScorerForUser).toHaveBeenCalledWith('user-1', 'seed_from_scorer', {
      isAutomatedTrigger: true,
    });
  });

  it("a plain 'heartbeat' call with no override stays subject to the manual budget (matches sync-now's interactive nature)", async () => {
    const { deliverWorkdayPresence } = await import('../deliver-now');

    await deliverWorkdayPresence('user-1');

    expect(mockSeedFromScorerForUser).toHaveBeenCalledWith('user-1', 'seed_from_scorer', {
      isAutomatedTrigger: false,
    });
  });

  it("ingest-and-deliver's explicit isAutomatedTrigger: true on 'heartbeat' is respected (the scheduled tick is exempt)", async () => {
    const { deliverWorkdayPresence } = await import('../deliver-now');

    await deliverWorkdayPresence('user-1', { isAutomatedTrigger: true });

    expect(mockSeedFromScorerForUser).toHaveBeenCalledWith('user-1', 'seed_from_scorer', {
      isAutomatedTrigger: true,
    });
  });

  it('an explicit isAutomatedTrigger: false override on push is respected (caller value always wins over the inferred default)', async () => {
    const { deliverWorkdayPresence } = await import('../deliver-now');

    await deliverWorkdayPresence('user-1', {
      trigger: 'push',
      syncDelta: { gmail: 1, calendar: 0, drive: 0 },
      isAutomatedTrigger: false,
    });

    expect(mockSeedFromScorerForUser).toHaveBeenCalledWith('user-1', 'seed_from_scorer', {
      isAutomatedTrigger: false,
    });
  });

  it('a non-material push never reaches seedFromScorerForUser at all (materiality gate still runs first)', async () => {
    const { deliverWorkdayPresence } = await import('../deliver-now');

    const result = await deliverWorkdayPresence('user-1', {
      trigger: 'push',
      syncDelta: { gmail: 0, calendar: 0, drive: 3 },
    });

    expect(mockSeedFromScorerForUser).not.toHaveBeenCalled();
    expect(result.seeded).toBe(false);
    expect(result.proactive).toBeNull();
  });
});
