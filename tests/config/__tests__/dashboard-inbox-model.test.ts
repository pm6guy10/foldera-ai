import { describe, expect, it } from 'vitest';
import {
  buildDailyValueState,
  buildFirstRunReadinessSlate,
  buildMissingInputPrompt,
  dailyUtilitySlateClipboardText,
  getIntegrationMetaLine,
  getIntegrationStateClass,
  getIntegrationStateLabel,
  normalizeDashboardPanel,
  type DailyUtilitySlate,
  type DashboardHistoryItem,
  type IntegrationStatusPayload,
} from '@/app/dashboard/dashboard-page-model';

function slateForReason(reason: string): DailyUtilitySlate {
  return {
    finished_artifact_verdict: 'no_finished_artifact',
    watch_item: {
      title: 'No safe finished action today',
      status: 'watch_item',
      evidence: [`Why Foldera stopped: ${reason}`],
      why_it_matters: 'Foldera stopped before turning this into finished work.',
      no_action_reason: reason,
      source_refs: ['persisted:no_send_receipt'],
    },
  };
}

describe('dashboard finished-work inbox model', () => {
  it('normalizes legacy panels into the unified dashboard sections', () => {
    expect(normalizeDashboardPanel(null)).toBe('today');
    expect(normalizeDashboardPanel('')).toBe('today');
    expect(normalizeDashboardPanel('briefing')).toBe('today');
    expect(normalizeDashboardPanel('today')).toBe('today');
    expect(normalizeDashboardPanel('audit-log')).toBe('history');
    expect(normalizeDashboardPanel('playbooks')).toBe('history');
    expect(normalizeDashboardPanel('history')).toBe('history');
    expect(normalizeDashboardPanel('signals')).toBe('sources');
    expect(normalizeDashboardPanel('integrations')).toBe('sources');
    expect(normalizeDashboardPanel('settings')).toBe('account');
    expect(normalizeDashboardPanel('account')).toBe('account');
    expect(normalizeDashboardPanel('unknown')).toBe('today');
  });

  it('derives safe missing-input copy for known no-artifact reasons', () => {
    expect(buildMissingInputPrompt(slateForReason('missing_grounded_recipient_for_send_message'))).toMatchObject({
      prompt: 'Who should this go to?',
    });
    expect(buildMissingInputPrompt(slateForReason('missing_current_artifact_anchor'))).toMatchObject({
      prompt: 'Which source has the current facts?',
    });
    expect(buildMissingInputPrompt(slateForReason('stale_status_without_current_artifact_facts'))).toMatchObject({
      prompt: 'Can Foldera get fresher source data?',
    });
    expect(buildMissingInputPrompt(slateForReason('weak_next_action'))).toMatchObject({
      prompt: 'What outcome should this change?',
    });
  });

  it('never exposes raw blocker, candidate, or gate language for unknown reasons', () => {
    const prompt = buildMissingInputPrompt(
      slateForReason('missing_unknown_candidate_gate: candidate failed internal scoring gate'),
    );
    expect(prompt).toBeNull();
  });

  it('builds a daily value state even when no finished artifact exists', () => {
    const integrations: IntegrationStatusPayload = {
      integrations: [
        {
          provider: 'google',
          is_active: true,
          sync_email: 'brandon@gmail.com',
          last_synced_at: '2026-05-07T14:30:00.000Z',
        },
      ],
      mail_ingest_looks_stale: true,
    };
    const history: DashboardHistoryItem[] = [
      {
        id: 'hist-1',
        status: 'skipped',
        action_type: 'do_nothing',
        directive_preview: 'Foldera held back yesterday because the facts were stale.',
      },
    ];

    const state = buildDailyValueState(
      slateForReason('stale_status_without_current_artifact_facts'),
      null,
      integrations,
      history,
    );

    expect(state.heading).toBe('Foldera checked today');
    expect(state.statusLabel).toBe('Held back safely');
    expect(state.valueBlocks.map((block) => block.label)).toEqual([
      'What changed',
      'What Foldera protected',
      'Smallest unlock',
    ]);
    expect(state.valueBlocks.map((block) => `${block.label} ${block.body}`).join(' ')).not.toMatch(
      /missing_|weak_|stale_|candidate|gate|blocker|[a-z]+_[a-z0-9_]+_[a-z0-9_]+/i,
    );
  });

  it('frames a primary move as useful value without pretending it is approved finished work', () => {
    const slate: DailyUtilitySlate = {
      finished_artifact_verdict: 'no_finished_artifact',
      primary_move: {
        title: 'Commitment due in 5d: Save job seeker account information',
        status: 'primary_move',
        evidence: ['Save job seeker account information before the website transition.'],
        why_it_matters:
          'The account transition may happen before the saved records are packaged.',
        next_action:
          'Write a decision memo that closes the account transition with the owner, next action, and deadline.',
        source_refs: ['commitment:8c9e725a-a5ce-461d-84c4-a9fec4338d70'],
      },
    };
    const state = buildDailyValueState(
      slate,
      null,
      { integrations: [{ provider: 'google', is_active: true }] },
      [],
    );

    expect(buildMissingInputPrompt(slate)).toBeNull();
    expect(state.heading).toBe('Foldera found the next move');
    expect(state.statusLabel).toBe('Current best move');
    expect(state.summary).toContain('Commitment due in 5d');
    expect(state.copyLabel).toBe('Copy brief');
    expect(state.copyText).toContain('Current best move');
    expect(state.copyText).toContain('Safe next action:');
    expect(state.valueBlocks.find((block) => block.label === 'What Foldera protected')?.body).toContain(
      'has not sent, saved, or claimed',
    );
  });

  it('builds clipboard text for the daily-value card without leaking internal terms', () => {
    const copyText = dailyUtilitySlateClipboardText({
      finished_artifact_verdict: 'no_finished_artifact',
      primary_move: {
        title: 'Commitment due in 5d: Save job seeker account information',
        status: 'primary_move',
        evidence: ['Save job seeker account information before the website transition.'],
        why_it_matters:
          'The account transition may happen before the saved records are packaged.',
        next_action:
          'Write a decision memo that closes the account transition with the owner, next action, and deadline.',
        source_refs: ['commitment:account-transition'],
      },
    });

    expect(copyText).toContain('Foldera');
    expect(copyText).toContain('Current best move');
    expect(copyText).toContain('Evidence:');
    expect(copyText).toContain('Safe next action:');
    expect(copyText).toContain('Saved commitment');
    expect(copyText).not.toMatch(/missing_|weak_|candidate|gate|blocker|commitment:[0-9a-f-]+|8c9e725a/i);
  });

  it('labels source cursors that need sync without treating them as disconnected', () => {
    const integration = {
      provider: 'azure_ad',
      is_active: true,
      sync_email: 'brandon@outlook.com',
      last_synced_at: '2026-05-06T11:04:20.111Z',
      needs_sync: true,
      sync_stale: false,
    };

    expect(getIntegrationStateLabel(integration)).toBe('Needs sync');
    expect(getIntegrationStateClass(integration)).toContain('amber');
    expect(getIntegrationMetaLine(integration)).toContain('Fresh sync needed');
    expect(getIntegrationMetaLine(integration)).not.toMatch(/missing_|weak_|candidate|gate|blocker/i);
  });

  it('turns first-run source readiness into human-readable dashboard value', () => {
    const slate = buildFirstRunReadinessSlate({
      status: 'connected_but_not_enough_evidence',
      connected: true,
      providers: ['Google'],
      signal_count: 1,
      processed_signal_count: 0,
      unprocessed_signal_count: 1,
      action_count: 0,
      pipeline_run_count: 0,
      last_checked_at: '2026-05-15T22:33:55.815Z',
      newest_signal_at: '2026-05-15T22:33:55.815Z',
      next_check_timing: 'Next check: use Check sources now, or wait for the next scheduled source refresh.',
      headline: 'Foldera connected Google, but only found 1 usable item so far.',
      reason: 'Foldera has 1 source item: 0 processed, 1 waiting. That is not enough evidence for a safe move yet.',
      next_action: 'Check sources now to process waiting metadata, or connect another source.',
      metadata_summary: 'Metadata says Google is connected and 1 Gmail/calendar item has arrived.',
      why_no_finished_move:
        'No finished move exists because 0 source items have been processed and no action or pipeline run exists yet.',
      value_unlock_next:
        'Check sources now to process the waiting item, or connect another source if this inbox is too thin.',
      nothing_sent_label: 'Nothing was sent.',
      can_check_now: true,
      value_proof_ready: true,
    });

    expect(slate?.watch_item?.title).toBe('Foldera connected Google, but only found 1 usable item so far.');
    expect(slate?.watch_item?.evidence.join(' ')).toContain('0 processed, 1 waiting');
    expect(slate?.watch_item?.evidence.join(' ')).toContain('Newest signal:');
    expect(slate?.watch_item?.evidence.join(' ')).toContain('Metadata says Google is connected');
    expect(slate?.watch_item?.evidence.join(' ')).toContain('Nothing was sent.');
    expect(slate?.watch_item?.next_action).toBe(
      'Check sources now to process the waiting item, or connect another source if this inbox is too thin.',
    );

    const state = buildDailyValueState(
      slate,
      null,
      { integrations: [{ provider: 'google', is_active: true, needs_sync: true }] },
      [],
    );

    expect(state.summary).toBe('Foldera connected Google, but only found 1 usable item so far.');
    expect(state.actionHref).toBe('/dashboard?panel=sources');
    expect(state.actionLabel).toBe('Check sources now');
  });

  it('can display a connected-and-syncing source state without making it GATE_9 value proof', () => {
    const slate = buildFirstRunReadinessSlate({
      status: 'connected_and_syncing',
      connected: true,
      providers: ['Google'],
      signal_count: 0,
      processed_signal_count: 0,
      unprocessed_signal_count: 0,
      action_count: 0,
      pipeline_run_count: 0,
      last_checked_at: null,
      newest_signal_at: null,
      next_check_timing: 'Next check: use Check sources now, or wait for the next scheduled source refresh.',
      headline: 'Foldera connected Google and is checking sources now.',
      reason: 'Foldera has not found usable source items yet: 0 processed, 0 waiting.',
      next_action: 'Check sources now to process waiting metadata, or connect another source.',
      metadata_summary: 'Metadata says Google is connected, but no Gmail/calendar items have arrived yet.',
      why_no_finished_move:
        'No finished move exists because 0 source items have been processed and no action or pipeline run exists yet.',
      value_unlock_next:
        'Connect another source if this inbox is too thin, or wait for the next source refresh.',
      nothing_sent_label: 'Nothing was sent.',
      can_check_now: true,
      value_proof_ready: false,
    });

    expect(slate?.watch_item?.title).toBe('Foldera connected Google and is checking sources now.');
    expect(slate?.watch_item?.evidence.join(' ')).toContain('0 source items: 0 processed, 0 waiting');
    expect(slate?.watch_item?.evidence.join(' ')).toContain('Next check: use Check sources now');
    expect(slate?.watch_item?.evidence.join(' ')).toContain('Nothing was sent.');
  });
});
