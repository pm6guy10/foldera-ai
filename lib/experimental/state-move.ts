/**
 * EXPERIMENT (#567 paradigm test) — "no-goals" decisive next-move.
 *
 * Hypothesis under test: a decisive next-move can be produced WITHOUT a stored
 * goal model (`tkg_goals`) — from (a) the owner's ONE stable objective, stated
 * not inferred, and (b) recent real signals + open commitments — and it beats
 * the goal-engine's output on the same live data.
 *
 * This is the falsifiable receipt for the head-to-head: it reproduces "Arm A"
 * so a future session with prod creds can re-run it for real. It is READ-ONLY
 * (SELECT only), makes exactly ONE paid LLM call, and NEVER reads or writes
 * `tkg_goals`, never mutates prod, never loosens a gate.
 *
 * Owner-only for now; multi-user comes after the paradigm is proven.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { runAgentSonnet } from '@/lib/agents/anthropic-runner';
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { createServerClient } from '@/lib/db/client';
import { STABLE_OBJECTIVE } from '@/lib/briefing/stable-objective';

export { STABLE_OBJECTIVE };

/** Strict shape the model must return — exactly one move, never a list. */
export interface StateMove {
  one_move: string;
  why_one_line: string;
  what_changed: string;
}

export interface StateMoveResult {
  move: StateMove | null;
  error?: string;
  /** Read-only evidence the move was computed from (provenance, not stored goals). */
  evidence_counts: { signals: number; commitments: number };
  objective: string;
}

interface SignalRow {
  type: string | null;
  source: string | null;
  author: string | null;
  occurred_at: string | null;
}

interface CommitmentRow {
  description: string | null;
  category: string | null;
  risk_score: number | null;
  due_at: string | null;
  implied_due_at: string | null;
}

const SIGNAL_LOOKBACK_DAYS = 14;
const SIGNAL_LIMIT = 80;
const COMMITMENT_LIMIT = 30;

const SYSTEM_PROMPT = `You are a decisive chief of staff. You are given exactly ONE stable objective and recent real-world evidence (inbound signals + the user's open commitment pool). Output the single highest-leverage next move toward the objective.

RULES:
- You have NO stored goal model and must not invent one. Reason only from the stated objective + the evidence provided.
- Rank strictly against the STATED OBJECTIVE, not against generic urgency or risk scores. A high-risk personal errand that does not serve the objective loses to a lower-risk item that does.
- If NOTHING in the evidence advances the objective, say so honestly in "one_move" (name the single best adjacent action, or state plainly that the answer is not in this data) — never fabricate urgency to fill silence.
- Output STRICT JSON only, no prose, no code fences: {"one_move": string, "why_one_line": string, "what_changed": string}.
- HARD CONSTRAINT: exactly ONE move. Never a list, never numbered options, never "and also". one_move is a single sentence.`;

function digestEvidence(signals: SignalRow[], commitments: CommitmentRow[]): string {
  const sig = signals
    .map((s) => `- ${s.occurred_at ?? '?'} [${s.type ?? '?'}/${s.source ?? '?'}] from ${s.author ?? '?'}`)
    .join('\n');
  const com = commitments
    .map(
      (c) =>
        `- (risk ${c.risk_score ?? '?'}, ${c.category ?? '?'}, due ${c.due_at ?? c.implied_due_at ?? 'none'}) ${c.description ?? ''}`,
    )
    .join('\n');
  return `RECENT INBOUND SIGNALS (last ${SIGNAL_LOOKBACK_DAYS}d, metadata only — bodies are encrypted and never read):\n${sig || '(none)'}\n\nOPEN COMMITMENT POOL (active, unsuppressed, ranked by the engine's generic risk score):\n${com || '(none)'}`;
}

/** Tolerant parse — strips code fences, requires the three string fields, rejects lists. */
function parseMove(text: string): StateMove | null {
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let obj: unknown;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      obj = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  if (
    typeof o.one_move !== 'string' ||
    typeof o.why_one_line !== 'string' ||
    typeof o.what_changed !== 'string'
  ) {
    return null;
  }
  return { one_move: o.one_move, why_one_line: o.why_one_line, what_changed: o.what_changed };
}

/**
 * Arm A of the experiment. Read-only; one paid LLM call; no `tkg_goals`.
 */
export async function runStateMove(opts: {
  userId?: string;
  objective?: string;
  supabase?: SupabaseClient;
} = {}): Promise<StateMoveResult> {
  const userId = opts.userId ?? process.env.FOLDERA_SELF_USER_ID?.trim() ?? OWNER_USER_ID;
  const objective = opts.objective ?? STABLE_OBJECTIVE;
  const supabase = opts.supabase ?? createServerClient();

  const sinceIso = new Date(Date.now() - SIGNAL_LOOKBACK_DAYS * 86_400_000).toISOString();

  const [signalsRes, commitmentsRes] = await Promise.all([
    supabase
      .from('tkg_signals')
      .select('type, source, author, occurred_at')
      .eq('user_id', userId)
      .gte('occurred_at', sinceIso)
      .order('occurred_at', { ascending: false })
      .limit(SIGNAL_LIMIT),
    supabase
      .from('tkg_commitments')
      .select('description, category, risk_score, due_at, implied_due_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .is('suppressed_at', null)
      .order('risk_score', { ascending: false, nullsFirst: false })
      .limit(COMMITMENT_LIMIT),
  ]);

  const signals = (signalsRes.data ?? []) as SignalRow[];
  const commitments = (commitmentsRes.data ?? []) as CommitmentRow[];
  const evidence_counts = { signals: signals.length, commitments: commitments.length };

  const res = await runAgentSonnet({
    job: 'state_move',
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `STABLE OBJECTIVE: ${objective}\n\n${digestEvidence(signals, commitments)}`,
      },
    ],
  });

  if ('error' in res) {
    return { move: null, error: res.error, evidence_counts, objective };
  }

  const move = parseMove(res.text);
  if (!move) {
    return { move: null, error: `unparseable model output: ${res.text.slice(0, 200)}`, evidence_counts, objective };
  }
  return { move, evidence_counts, objective };
}
