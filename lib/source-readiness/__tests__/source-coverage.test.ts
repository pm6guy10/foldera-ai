import { describe, expect, it } from 'vitest';

import { buildSourceCoverage } from '../source-coverage';

describe('source coverage', () => {
  it('marks gmail-only low-signal users as thin and recommends exactly one calendar unlock', () => {
    const coverage = buildSourceCoverage({
      connected_providers: ['google'],
      recent_processed_signal_sources: ['gmail'],
      processed_signal_count: 1,
    });

    expect(coverage).toMatchObject({
      has_email: true,
      has_calendar: false,
      has_docs: false,
      has_chat: false,
      has_tasks: false,
      source_depth: 'thin',
      magic_readiness: 'not_ready',
      next_best_connector: 'google_calendar',
    });
    expect(coverage.reason).toContain('Google Calendar unlocks deadlines');
  });

  it('keeps gmail-only high-signal users obligation-only instead of pretending deep context', () => {
    const coverage = buildSourceCoverage({
      connected_providers: ['google'],
      recent_processed_signal_sources: ['gmail'],
      processed_signal_count: 12,
    });

    expect(coverage.source_depth).toBe('usable');
    expect(coverage.magic_readiness).toBe('obligation_only');
    expect(coverage.next_best_connector).toBe('google_calendar');
  });

  it('allows email plus calendar obligations when enough processed cross-source signals exist', () => {
    const coverage = buildSourceCoverage({
      connected_providers: ['google'],
      recent_processed_signal_sources: ['gmail', 'google_calendar'],
      processed_signal_count: 6,
    });

    expect(coverage.source_depth).toBe('usable');
    expect(coverage.magic_readiness).toBe('obligation_only');
    expect(coverage.next_best_connector).toBe('google_drive');
  });

  it('raises readiness to context_ready when documents join email and calendar', () => {
    const coverage = buildSourceCoverage({
      connected_providers: ['microsoft'],
      recent_processed_signal_sources: ['outlook', 'outlook_calendar', 'onedrive'],
      processed_signal_count: 8,
    });

    expect(coverage.has_docs).toBe(true);
    expect(coverage.source_depth).toBe('rich');
    expect(coverage.magic_readiness).toBe('context_ready');
    expect(coverage.next_best_connector).toBe('teams');
  });

  it('keeps chat-only cross-source users below operator_ready until docs are present too', () => {
    const coverage = buildSourceCoverage({
      connected_providers: ['google'],
      recent_processed_signal_sources: ['gmail', 'google_calendar', 'slack'],
      processed_signal_count: 9,
    });

    expect(coverage.has_chat).toBe(true);
    expect(coverage.source_depth).toBe('usable');
    expect(coverage.magic_readiness).toBe('obligation_only');
    expect(coverage.next_best_connector).toBe('google_drive');
  });

  it('raises readiness to operator_ready only when docs and active work both exist', () => {
    const coverage = buildSourceCoverage({
      connected_providers: ['google'],
      recent_processed_signal_sources: ['gmail', 'google_calendar', 'drive', 'slack'],
      processed_signal_count: 12,
    });

    expect(coverage.source_depth).toBe('rich');
    expect(coverage.magic_readiness).toBe('operator_ready');
    expect(coverage.next_best_connector).toBe('tasks');
  });

  it('forces stale connected sources back to not_ready', () => {
    const coverage = buildSourceCoverage({
      connected_providers: ['google'],
      recent_processed_signal_sources: ['gmail', 'google_calendar', 'drive'],
      processed_signal_count: 12,
      source_is_stale: true,
    });

    expect(coverage.source_depth).toBe('thin');
    expect(coverage.magic_readiness).toBe('not_ready');
  });
});
