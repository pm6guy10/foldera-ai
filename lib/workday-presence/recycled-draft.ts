import { draftIsReviewable, type WorkdayPresenceDraft, type WorkdayPresenceState } from './model';

/**
 * #394 — recycle an already-generated, already-PAID artifact into a reviewable
 * presence draft, with NO new LLM call. The daily brief generates grounded
 * artifacts into `tkg_actions.artifact` ({ title, content, type, ... }); this
 * maps the latest one into a `WorkdayPresenceDraft` so the guardian has finished
 * work to present instead of staying SAFE_SILENT — but only when it provably
 * belongs to the same move (a mismatched draft is fabrication, worse than quiet).
 */

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Maps a stored tkg_actions.artifact jsonb into a draft. Pure — no generation. */
export function draftFromArtifactRow(artifact: unknown): WorkdayPresenceDraft | null {
  if (!artifact || typeof artifact !== 'object') return null;
  const row = artifact as Record<string, unknown>;
  const title = clean(row.title);
  const body = clean(row.content) ?? clean(row.body);
  // Not reviewable without real content — a title alone is a label, not a draft.
  if (!body) return null;
  return {
    action_type: clean(row.type) ?? 'write_document',
    title: title ?? 'Prepared move',
    preview: body.slice(0, 280),
    body,
  };
}

/** Normalizes a label for comparison: drops SYNC: machine prefixes + punctuation. */
function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/^sync:[^:]*:/i, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Conservative same-move check. Errs toward NO match (→ stay quiet) over a wrong
 * card. Matches only on containment or strong token overlap of meaningful words.
 */
export function artifactMatchesMove(focus: string, artifactTitle: string | null): boolean {
  const a = normalizeLabel(focus);
  const b = normalizeLabel(artifactTitle ?? '');
  if (a.length < 3 || b.length < 3) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const aTokens = new Set(a.split(' ').filter((t) => t.length > 3));
  const bTokens = new Set(b.split(' ').filter((t) => t.length > 3));
  if (aTokens.size === 0 || bTokens.size === 0) return false;
  let shared = 0;
  for (const token of aTokens) if (bTokens.has(token)) shared += 1;
  return shared / Math.min(aTokens.size, bTokens.size) >= 0.7;
}

/**
 * Attaches a recycled draft to a draftless `scored_winner` state — but ONLY when
 * the artifact clearly belongs to the same move. No-op (state unchanged) when the
 * state already has a reviewable draft, is not a scored winner, the artifact is
 * not reviewable, or it does not match the move. Pure; recycles paid generation.
 */
export function attachRecycledDraft(
  state: WorkdayPresenceState,
  artifact: unknown,
): WorkdayPresenceState {
  if (state.draft && draftIsReviewable(state.draft)) return state;
  if (state.state_source !== 'scored_winner') return state;
  const draft = draftFromArtifactRow(artifact);
  if (!draft) return state;
  const artifactTitle = clean((artifact as Record<string, unknown>)?.title);
  if (!artifactMatchesMove(state.current_focus, artifactTitle)) return state;
  return { ...state, draft };
}
