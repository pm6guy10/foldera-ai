/**
 * Detects template-style [slots] in model output without rejecting real names
 * like [Nicole Vreeland] or short acronyms like [HCA] (golden-path quality gate).
 */

/**
 * Known template slot words (whole bracket = slot).
 * Omit `subject` — models often emit meta like [Subject] / [SUBJECT] in email subjects; that is
 * finished copy for the user, not a fill-in slot. Omit overly generic tokens that rarely appear as
 * literal [word] placeholders in subjects.
 */
const SLOT_WORD =
  'name|company|date|role|title|recipient|amount|contact|user|sender|client|person|candidate|reader|addressee|employer|organization|department|signature|phone|email|address|link|deadline|time|location|venue|host|topic|here|unknown|placeholder';

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
