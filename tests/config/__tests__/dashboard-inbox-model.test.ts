import { describe, expect, it } from 'vitest';
import {
  buildMissingInputPrompt,
  normalizeDashboardPanel,
  type DailyUtilitySlate,
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
  it('normalizes legacy panels into Today, History, and Sources', () => {
    expect(normalizeDashboardPanel(null)).toBe('today');
    expect(normalizeDashboardPanel('')).toBe('today');
    expect(normalizeDashboardPanel('briefing')).toBe('today');
    expect(normalizeDashboardPanel('today')).toBe('today');
    expect(normalizeDashboardPanel('audit-log')).toBe('history');
    expect(normalizeDashboardPanel('playbooks')).toBe('history');
    expect(normalizeDashboardPanel('history')).toBe('history');
    expect(normalizeDashboardPanel('signals')).toBe('sources');
    expect(normalizeDashboardPanel('integrations')).toBe('sources');
    expect(normalizeDashboardPanel('settings')).toBe('sources');
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
});
