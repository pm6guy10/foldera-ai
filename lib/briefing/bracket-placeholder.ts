/**
 * Detects template-style [slots] in model output without rejecting real names
 * like [Nicole Vreeland] or short acronyms like [HCA] (golden-path quality gate).
 */

/**
 * Known template slot words (whole bracket = slot).
 * Omit `subject` — models emit [Subject] in real subjects. Omit `deadline|time|topic` — those
 * tokens appear in **finished** write_document titles about real deadline/time/thread work (e.g.
 * behavioral-pattern “deadline across contacts” winners); `[INSERT DATE]` / `[DUE DATE]` still
 * fail via named caps + fill-markers.
 */
const SLOT_WORD =
  'name|company|date|role|title|recipient|amount|contact|user|sender|client|person|candidate|reader|addressee|employer|organization|department|signature|phone|email|address|link|location|venue|host|here|unknown|placeholder';

/** Whole-bracket content is a known slot word, e.g. [name], [date] */
const WHOLE_SLOT = new RegExp(`\\[(?:${SLOT_WORD})\\](?!\\w)`, 'i');

/** [your …], [insert …] */
const YOUR_OR_INSERT = /\[(?:your|insert)\s+[^\]]+\]/i;

/** Obvious fill-in markers inside brackets */
const FILL_MARKERS =
  /\[[^\]]*(?:insert|placeholder|\.{3,}|xxx|yyy|fill\s*in|fill\s+here|lorem|tbd|\bn\/a\b)[^\]]*\]/i;

/**
 * Explicit multi-word templates in ALL CAPS (narrow list — avoids false positives like [VIP CLIENT]
 * or [DUE DATE] when those are literal labels).
 */
const NAMED_CAPS_TEMPLATE_BRACKET =
  /\[(?:INSERT\s+DATE|YOUR\s+NAME|DUE\s+DATE|FILL\s+HERE|PLACEHOLDER|TBD|TBC)\]/i;

export function hasBracketTemplatePlaceholder(s: string): boolean {
  if (FILL_MARKERS.test(s)) return true;
  if (WHOLE_SLOT.test(s)) return true;
  if (YOUR_OR_INSERT.test(s)) return true;
  if (NAMED_CAPS_TEMPLATE_BRACKET.test(s)) return true;
  return false;
}
