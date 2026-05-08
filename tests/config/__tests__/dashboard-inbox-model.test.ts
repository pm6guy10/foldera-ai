import { describe, expect, it } from 'vitest';
import {
  buildDailyValueState,
  buildMissingInputPrompt,
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
    expect(state.statusLabel).toBe('Needs fresher source');
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
    const state = buildDailyValueState(
      {
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
      },
      null,
      { integrations: [{ provider: 'google', is_active: true }] },
      [],
    );

    expect(state.heading).toBe('Foldera found the next move');
    expect(state.statusLabel).toBe('Current best move');
    expect(state.summary).toContain('Commitment due in 5d');
    expect(state.valueBlocks.find((block) => block.label === 'What Foldera protected')?.body).toContain(
      'has not sent, saved, or claimed',
    );
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
});
