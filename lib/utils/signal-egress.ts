export const SIGNAL_CONTEXT_LIMIT = 150;

export const SIGNAL_CONTEXT_SELECT =
  'id, user_id, source, source_id, type, author, recipients, occurred_at, extracted_entities, extracted_commitments, extracted_dates, extracted_amounts, outcome_label, processed';

export const MAX_SIGNAL_CONTENT_CHARS = 15_000;

export function truncateSignalContent(content: string): string {
  if (content.length <= MAX_SIGNAL_CONTENT_CHARS) return content;
  return content.slice(0, MAX_SIGNAL_CONTENT_CHARS);
}
