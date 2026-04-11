/**
 * Golden replay fixtures distilled from recent production shapes (2026-04).
 * Used by `replay-harness.test.ts` — keep payloads minimal but representative.
 */

/** Anchor time aligned with live success window (2026-04-11). */
export const REPLAY_ANCHOR_NOW = new Date('2026-04-11T15:00:00.000Z');

/**
 * Persisted hunt success archetype (pending_approval_persisted).
 * Live reference: action_id e204dd04-4854-4269-b775-58ad16d791e6,
 * winner_candidate_id hunt_ignored_no_reply_alerts_chase_com, generated_at 2026-04-11T14:47:51.368Z.
 */
export const PERSISTED_HUNT_SUCCESS_META = {
  action_id: 'e204dd04-4854-4269-b775-58ad16d791e6',
  winner_candidate_id: 'hunt_ignored_no_reply_alerts_chase_com',
  generation_status: 'pending_approval_persisted' as const,
  generated_at_iso: '2026-04-11T14:47:51.368Z',
};

/** User-facing fields for a grounded hunt send_message that clears stale-date scan at REPLAY_ANCHOR_NOW. */
export const PERSISTED_HUNT_SUCCESS_USER_FACING = {
  directive: 'Chase the ignored no-reply alerts thread and confirm the next human-owned step before end of week.',
  why_now: 'The thread is still open in the hunt window; consolidate before Monday.',
  evidence: 'Last visible activity remains within the current sprint.',
  insight: 'Prefer a single clear owner on the client side.',
};

/** Hunt allowlist from winning signal rows (single grounded peer). */
export const PERSISTED_HUNT_SUCCESS_ALLOWLIST = ['alerts-chase-peer@client.example.com'] as const;

export const PERSISTED_HUNT_SUCCESS_ARTIFACT = {
  type: 'email' as const,
  to: 'alerts-chase-peer@client.example.com',
  subject: 'Re: open alerts — next step',
  body: 'Quick check on who owns the reply on your side.',
};

/** Locked display names that must not survive user-facing text (scrub or block). */
export const LOCKED_CONTACT_REPLAY_LINES = ['Nicole Vreeland', 'Cheryl Anderson'] as const;

export const LOCKED_CONTACT_DIRTY_PAYLOAD = {
  directive: 'Follow up with Nicole Vreeland about Cheryl Anderson and the deadline.',
  artifact: {
    type: 'email' as const,
    to: 'ops@example.com',
    subject: 'Nicole Vreeland — status',
    body: 'Cheryl Anderson asked about April.',
  },
};

/** Directive copy that must trip stale_date_in_directive at a fixed now (matches generator gate). */
export const STALE_DATE_REPLAY_NOW = new Date('2026-04-07T12:00:00.000Z');
export const STALE_DATE_REPLAY_TEXT =
  'Please confirm by 2026-04-01 end of day; last commitment was due 2026-03-27.';

/** Model invented address; singleton allowlist enables deterministic coercion. */
export const HUNT_FAKE_TO_BEFORE_COERCION = {
  artifact_type: 'send_message' as const,
  directive: 'Reply on the hunt thread.',
  why_now: 'Peer is waiting.',
  artifact: {
    type: 'email' as const,
    to: 'made.up@example.com',
    subject: 'Re: thread',
    body: 'Hello',
  },
};

/** Two eligible peers — coercion is disabled; wrong "to" must stay invalid. */
export const HUNT_MULTI_ALLOWLIST = ['alpha@client.com', 'beta@client.com'] as const;

/**
 * Rows that would be returned by the loop query (funnel only). Identical skipped/do_nothing
 * tombstones are excluded at SQL — this list models "what the evaluator sees".
 */
export const LOOP_FUNNEL_ROWS_NO_LOOP = [
  { directive_text: 'First unique pending directive about vendor contract renewal', execution_result: {} },
  { directive_text: 'Second unique approved directive about hiring pipeline follow up', execution_result: {} },
  { directive_text: 'Third unique executed directive about quarterly planning checkpoint', execution_result: {} },
];

const longDup =
  'Operational chase thread consolidate next steps before Monday for ignored alerts';
export const LOOP_FUNNEL_ROWS_TRUE_LOOP = [
  {
    directive_text: longDup,
    execution_result: {
      generation_log: {
        candidateDiscovery: {
          topCandidates: [
            { decision: 'selected', sourceSignals: [{ kind: 'signal', id: 'sig-loop-a' }] },
          ],
        },
      },
    },
  },
  {
    directive_text: `${longDup} `,
    execution_result: {
      generation_log: {
        candidateDiscovery: {
          topCandidates: [
            { decision: 'selected', sourceSignals: [{ kind: 'signal', id: 'sig-loop-b' }] },
          ],
        },
      },
    },
  },
  {
    directive_text: longDup,
    execution_result: {
      generation_log: {
        candidateDiscovery: {
          topCandidates: [
            { decision: 'selected', sourceSignals: [{ kind: 'relationship', id: 'ent-loop-c' }] },
          ],
        },
      },
    },
  },
];

/** Validity-context extractor false positives (must be filtered before rejection matching). */
export const VALIDITY_FALSE_POSITIVE_NAMES = ['Financial', 'Personal', 'Reference', 'Complete'] as const;
