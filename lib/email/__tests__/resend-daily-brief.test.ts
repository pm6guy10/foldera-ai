import { describe, expect, it } from 'vitest';
import {
  buildDailyDirectiveEmailHtml,
  isInternalFailureText,
  NO_SEND_BODY_TEXT,
  NO_SEND_DIRECTIVE_TEXT,
} from '@/lib/email/resend';

const BASE_URL = 'https://foldera.ai';
const DATE = '2026-04-27';

describe('daily brief no-send sanitization', () => {
  it('renders clean no-action html for persisted blocker text like "All 10 candidates blocked"', () => {
    const html = buildDailyDirectiveEmailHtml({
      baseUrl: BASE_URL,
      date: DATE,
      directive: {
        id: 'blocked-1',
        directive: 'All 10 candidates blocked',
        action_type: 'do_nothing',
        confidence: 0,
        reason: 'artifact_viability:no_grounded_recipient_for_send_message',
        artifact: {
          type: 'wait_rationale',
          context: 'Foldera evaluated 10 candidates today. candidateFailureReasons: llm_failed',
          evidence: 'All 10 candidates blocked',
          tripwires: ['trigger_lock:missing_explicit_ask'],
        },
      },
    });

    expect(html).toContain(NO_SEND_DIRECTIVE_TEXT);
    expect(html).toContain(NO_SEND_BODY_TEXT);
    expect(html).not.toContain('Finished artifact');
    expect(html).not.toContain('Approve</a>');
    expect(html).not.toContain('Skip</a>');
    expect(html).not.toContain('All 10 candidates blocked');
    expect(html).not.toContain('artifact_viability');
    expect(html).not.toContain('trigger_lock');
    expect(html).not.toContain('candidateFailureReasons');
  });

  it('does not leak llm_failed into no-send html', () => {
    const html = buildDailyDirectiveEmailHtml({
      baseUrl: BASE_URL,
      date: DATE,
      directive: {
        id: 'blocked-2',
        directive: 'llm_failed',
        action_type: 'do_nothing',
        confidence: 0,
        reason: 'llm_failed: model timeout',
        artifact: {
          type: 'wait_rationale',
          context: 'llm_failed while generating top candidate',
          evidence: 'llm_failed',
        },
      },
    });

    expect(html).not.toContain('llm_failed');
    expect(html).toContain(NO_SEND_DIRECTIVE_TEXT);
  });

  it('does not leak stale_date_in_directive into no-send html', () => {
    const html = buildDailyDirectiveEmailHtml({
      baseUrl: BASE_URL,
      date: DATE,
      directive: {
        id: 'blocked-3',
        directive: 'stale_date_in_directive:March 30',
        action_type: 'do_nothing',
        confidence: 0,
        reason: 'stale_date_in_directive:March 30',
        artifact: {
          type: 'wait_rationale',
          context: 'stale_date_in_directive:March 30',
          evidence: 'stale_date_in_directive:March 30',
        },
      },
    });

    expect(html).not.toContain('stale_date_in_directive');
    expect(html).toContain(NO_SEND_BODY_TEXT);
  });

  it('never renders owner healthLine text in customer daily brief html', () => {
    const html = buildDailyDirectiveEmailHtml({
      baseUrl: BASE_URL,
      date: DATE,
      directive: null,
      healthLine: 'System: RED — INFINITE_LOOP',
    } as unknown as Parameters<typeof buildDailyDirectiveEmailHtml>[0]);

    expect(html).not.toContain('System: RED');
    expect(html).not.toContain('INFINITE_LOOP');
  });

  it('keeps send_message approve/skip flow for actionable directives', () => {
    const html = buildDailyDirectiveEmailHtml({
      baseUrl: BASE_URL,
      date: DATE,
      directive: {
        id: 'action-1',
        directive: 'Send the update now.',
        action_type: 'send_message',
        confidence: 82,
        reason: 'Momentum is high.',
        artifact: {
          type: 'email',
          draft_type: 'email_compose',
          to: 'partner@example.com',
          subject: 'Quick update',
          body: 'Hi team,\n\nCan you confirm by EOD?\n\nThanks.',
        },
      },
    });

    expect(html).toContain('Finished artifact');
    expect(html).toContain('Approve</a>');
    expect(html).toContain('Skip</a>');
  });

  it('keeps write_document artifact rendering for actionable directives', () => {
    const html = buildDailyDirectiveEmailHtml({
      baseUrl: BASE_URL,
      date: DATE,
      directive: {
        id: 'action-2',
        directive: 'Share the finalized prep doc.',
        action_type: 'write_document',
        confidence: 80,
        reason: 'Interview is this week.',
        artifact: {
          type: 'document',
          title: 'Interview Prep Packet',
          content: 'Finalize the packet and send it by 5 PM PT.',
        },
      },
    });

    expect(html).toContain('Finished artifact');
    expect(html).toContain('Interview Prep Packet');
    expect(html).toContain('Finalize the packet and send it by 5 PM PT.');
  });
});

describe('isInternalFailureText', () => {
  it('flags exact internal failure tokens that must never be customer-facing', () => {
    expect(isInternalFailureText('llm_failed')).toBe(true);
    expect(isInternalFailureText('stale_date_in_directive:March 30')).toBe(true);
    expect(isInternalFailureText('System: RED — INFINITE_LOOP')).toBe(true);
    expect(isInternalFailureText('Normal customer copy.')).toBe(false);
  });
});
