import { describe, expect, it } from 'vitest';

import {
  countCurrentWorkdayPresenceReceipts,
  isCurrentWorkdayPresenceReceipt,
} from '../current-runtime-truth';

describe('current runtime truth helpers', () => {
  it('counts only current Workday Presence receipts', () => {
    const rows = [
      { action_source: 'workday_presence' },
      { action_source: 'workday_presence_trigger' },
      { action_source: null, execution_result: { brief_origin: 'daily_cron' } },
      { action_source: 'agent_health_watchdog' },
      { action_source: 'agent_distribution_finder' },
    ];

    expect(countCurrentWorkdayPresenceReceipts(rows)).toBe(2);
  });

  it('treats legacy daily-brief rows as non-current runtime truth', () => {
    expect(
      isCurrentWorkdayPresenceReceipt({
        action_source: null,
        execution_result: { brief_origin: 'daily_cron' },
      }),
    ).toBe(false);
  });
});
