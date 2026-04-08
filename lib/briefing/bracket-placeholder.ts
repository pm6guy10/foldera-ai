/**
 * Detects template-style [slots] in model output without rejecting real names
 * like [Nicole Vreeland] or short acronyms like [HCA] (golden-path quality gate).
 */

const SLOT_WORD =
  'name|company|date|role|title|recipient|amount|contact|user|sender|client|person|candidate|reader|addressee|employer|organization|department|signature|phone|email|address|link|deadline|time|location|venue|host|topic|subject|here|unknown|placeholder';

/** Whole-bracket content is a known slot word, e.g. [name], [date] */
const WHOLE_SLOT = new RegExp(`\\[(?:${SLOT_WORD})\\](?!\\w)`, 'i');

/** [your …], [insert …] */
const YOUR_OR_INSERT = /\[(?:your|insert)\s+[^\]]+\]/i;

/** Obvious fill-in markers inside brackets */
const FILL_MARKERS =
  /\[[^\]]*(?:insert|placeholder|\.{3,}|xxx|yyy|fill\s*in|lorem|tbd|\bn\/a\b)[^\]]*\]/i;

/**
 * Two or more space-separated ALL-CAPS words: [INSERT DATE], [FILL HERE].
 * Single-token brackets like [HCA] or [PDF] are allowed.
 */
const MULTI_ALL_CAPS_BRACKET = /\[(?:[A-Z]+)(?:\s+[A-Z]+)+\]/;

export function hasBracketTemplatePlaceholder(s: string): boolean {
  if (FILL_MARKERS.test(s)) return true;
  if (WHOLE_SLOT.test(s)) return true;
  if (YOUR_OR_INSERT.test(s)) return true;
  if (MULTI_ALL_CAPS_BRACKET.test(s)) return true;
  return false;
}
