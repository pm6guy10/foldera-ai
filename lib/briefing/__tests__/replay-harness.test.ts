/**
 * Bankable replay suite: recent success/failure classes without LLM spend.
 */
import { describe, expect, it } from 'vitest';
import {
  applyHuntSendMessageRecipientCoercion,
  collectHuntSendMessageToValidationIssues,
} from '../generator';
import {
  findLockedContactsInUserFacingPayload,
  sanitizeConvictionPayloadLockedContactsInPlace,
} from '../locked-contact-scan';
import {
  directiveHasStalePastDates,
  evaluatePersistedDirectiveContentLoopFromRows,
  userFacingStaleDateScanText,
} from '../scorer-failure-suppression';
import { filterPersonNamesForValidityContext } from '../validity-context-entity';
import {
  HUNT_FAKE_TO_BEFORE_COERCION,
  HUNT_MULTI_ALLOWLIST,
  LOCKED_CONTACT_DIRTY_PAYLOAD,
  LOCKED_CONTACT_REPLAY_LINES,
  LOOP_FUNNEL_ROWS_NO_LOOP,
  LOOP_FUNNEL_ROWS_TRUE_LOOP,
  PERSISTED_HUNT_SUCCESS_ALLOWLIST,
  PERSISTED_HUNT_SUCCESS_ARTIFACT,
  PERSISTED_HUNT_SUCCESS_META,
  PERSISTED_HUNT_SUCCESS_USER_FACING,
  REPLAY_ANCHOR_NOW,
  STALE_DATE_REPLAY_NOW,
  STALE_DATE_REPLAY_TEXT,
  VALIDITY_FALSE_POSITIVE_NAMES,
} from './replay-harness.fixtures';

describe('replay harness — persisted hunt success survives deterministic gates', () => {
  it('metadata fixture documents live winning row (regression anchor)', () => {
    expect(PERSISTED_HUNT_SUCCESS_META.winner_candidate_id).toMatch(/^hunt_/);
    expect(PERSISTED_HUNT_SUCCESS_META.action_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('no stale dates in user-facing scan text at replay anchor', () => {
    const blob = userFacingStaleDateScanText(PERSISTED_HUNT_SUCCESS_USER_FACING);
    const r = directiveHasStalePastDates(blob, REPLAY_ANCHOR_NOW, 3);
    expect(r.stale).toBe(false);
  });

  it('hunt send_message "to" matches allowlist (grounded recipient)', () => {
    const ctx = {
      candidate_class: 'hunt' as const,
      hunt_send_message_recipient_allowlist: [...PERSISTED_HUNT_SUCCESS_ALLOWLIST],
    };
    const issues = collectHuntSendMessageToValidationIssues(
      ctx,
      'send_message',
      PERSISTED_HUNT_SUCCESS_ARTIFACT.to,
    );
    expect(issues).toEqual([]);
  });
});

describe('replay harness — locked_contact_in_artifact / sanitization', () => {
  it('scrub removes locked names from directive + email artifact', () => {
    const payload = structuredClone(LOCKED_CONTACT_DIRTY_PAYLOAD);
    const lines = [...LOCKED_CONTACT_REPLAY_LINES];
    const changed = sanitizeConvictionPayloadLockedContactsInPlace(payload, lines);
    expect(changed).toBe(true);
    expect(
      findLockedContactsInUserFacingPayload(
        lines,
        payload.directive.toLowerCase(),
        payload.artifact,
      ),
    ).toEqual([]);
  });
});

describe('replay harness — stale_date_in_directive', () => {
  it('flags ISO dates beyond grace vs fixed now', () => {
    const r = directiveHasStalePastDates(STALE_DATE_REPLAY_TEXT, STALE_DATE_REPLAY_NOW, 3);
    expect(r.stale).toBe(true);
    expect(r.matches.some((m) => m.includes('2026-04-01') || m.includes('2026-03-27'))).toBe(true);
  });
});

describe('replay harness — hunt recipient allowlist / coercion', () => {
  it('coerces singleton allowlist when model invents an address', () => {
    const parsed = structuredClone(HUNT_FAKE_TO_BEFORE_COERCION) as Parameters<
      typeof applyHuntSendMessageRecipientCoercion
    >[0];
    const ctx = {
      candidate_class: 'hunt' as const,
      hunt_send_message_recipient_allowlist: ['real.peer@client.com'],
    };
    const coerced = applyHuntSendMessageRecipientCoercion(parsed, ctx, 'send_message');
    expect(coerced).toBe(true);
    const art = parsed.artifact as Record<string, unknown>;
    expect(art.to).toBe('real.peer@client.com');
    expect(collectHuntSendMessageToValidationIssues(ctx, 'send_message', art.to)).toEqual([]);
  });

  it('coerces to the first grounded allowlist entry when multiple hunt recipients are grounded', () => {
    const parsed = structuredClone(HUNT_FAKE_TO_BEFORE_COERCION) as Parameters<
      typeof applyHuntSendMessageRecipientCoercion
    >[0];
    const ctx = {
      candidate_class: 'hunt' as const,
      hunt_send_message_recipient_allowlist: [...HUNT_MULTI_ALLOWLIST],
    };
    expect(applyHuntSendMessageRecipientCoercion(parsed, ctx, 'send_message')).toBe(true);
    const art = parsed.artifact as Record<string, unknown>;
    expect(art.to).toBe(HUNT_MULTI_ALLOWLIST[0]);
    const issues = collectHuntSendMessageToValidationIssues(
      ctx,
      'send_message',
      art.to,
    );
    expect(issues).toEqual([]);
  });
});

describe('replay harness — validity-context false positives', () => {
  it('filters Financial / Personal / scaffold tokens', () => {
    expect(filterPersonNamesForValidityContext([...VALIDITY_FALSE_POSITIVE_NAMES])).toEqual([]);
  });
});

describe('replay harness — GENERATION_LOOP_DETECTED (funnel rows only)', () => {
  it('does not loop on sparse funnel directives', () => {
    const r = evaluatePersistedDirectiveContentLoopFromRows(LOOP_FUNNEL_ROWS_NO_LOOP);
    expect(r.isLoop).toBe(false);
  });

  it('detects loop when three funnel rows share normalized directive; aggregates suppression keys', () => {
    const r = evaluatePersistedDirectiveContentLoopFromRows(LOOP_FUNNEL_ROWS_TRUE_LOOP);
    expect(r.isLoop).toBe(true);
    if (r.isLoop) {
      expect(r.keys).toEqual(expect.arrayContaining(['signal:sig-loop-a', 'signal:sig-loop-b', 'entity:ent-loop-c']));
    }
  });

  it('contract: repeated no-send summaries would read as a loop if passed in — cron SQL must exclude them', () => {
    const tombstoneLike = Array.from({ length: 12 }, () => ({
      directive_text:
        'Nothing cleared the bar today — 3 candidates evaluated, none ready to send.',
      execution_result: {},
    }));
    expect(evaluatePersistedDirectiveContentLoopFromRows(tombstoneLike).isLoop).toBe(true);
  });
});
