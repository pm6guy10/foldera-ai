export interface SignalMetadataRow {
  id: string;
  source: string;
  type: string | null;
  occurred_at: string;
  author: string | null;
  source_id?: string | null;
}

export interface SignalMetadataSummaryRow {
  id: string;
  source: string;
  type: string;
  occurred_at: string;
  author: string | null;
  source_id?: string | null;
  content: string;
  thread_size: number;
}

function normalizeAuthorKey(author: string | null | undefined): string | null {
  if (!author) return null;
  const email = author.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]?.toLowerCase();
  if (email) {
    if (email === 'self') return null;
    return email;
  }
  const normalized = author.trim().toLowerCase();
  if (!normalized || normalized === 'self' || normalized === 'foldera-derived') return null;
  return normalized;
}

function metadataLabelForRow(row: SignalMetadataRow): string {
  switch (row.type) {
    case 'email_received':
      return '[Email received metadata]';
    case 'email_sent':
      return '[Sent email metadata]';
    case 'calendar_event':
      return '[Calendar event: Metadata only]';
    case 'response_pattern':
      return '[Response pattern metadata]';
    default:
      if (row.source === 'drive' || row.source === 'onedrive') return '[Document activity metadata]';
      if (row.source === 'google_calendar' || row.source === 'outlook_calendar') return '[Calendar event: Metadata only]';
      if (row.source === 'microsoft_todo') return '[Task metadata]';
      if (row.source === 'claude_conversation' || row.source === 'chatgpt_conversation' || row.source === 'conversation_ingest') {
        return '[Conversation metadata]';
      }
      return '[Signal metadata]';
  }
}

export function buildSignalMetadataSummary(
  row: SignalMetadataRow,
  threadSize: number,
): string {
  const lines = [metadataLabelForRow(row)];
  if (row.type === 'email_received') {
    lines.push(`From: ${row.author ?? 'unknown sender'}`);
  } else if (row.type === 'email_sent') {
    lines.push('From: self');
  } else if (row.author) {
    lines.push(`Author: ${row.author}`);
  }

  if (row.source === 'google_calendar' || row.source === 'outlook_calendar' || row.type === 'calendar_event') {
    lines.push(`Start: ${row.occurred_at}`);
  } else {
    lines.push(`Occurred: ${row.occurred_at}`);
  }

  lines.push(`Source: ${row.source}`);
  lines.push(`Signal type: ${row.type ?? 'unknown'}`);

  if (
    row.type === 'email_received' ||
    row.type === 'email_sent' ||
    row.type === 'response_pattern'
  ) {
    lines.push(`Thread messages (metadata window): ${Math.max(1, threadSize)}`);
  }

  return lines.join('\n');
}

export function buildSignalMetadataSummaryRows(
  rows: ReadonlyArray<SignalMetadataRow>,
): SignalMetadataSummaryRow[] {
  const authorCounts = new Map<string, number>();

  for (const row of rows) {
    if (row.type !== 'email_received' && row.type !== 'response_pattern') continue;
    const key = normalizeAuthorKey(row.author);
    if (!key) continue;
    authorCounts.set(key, (authorCounts.get(key) ?? 0) + 1);
  }

  return rows.map((row) => {
    const authorKey = normalizeAuthorKey(row.author);
    const threadSize =
      row.type === 'email_received' || row.type === 'response_pattern'
        ? Math.max(1, authorKey ? (authorCounts.get(authorKey) ?? 1) : 1)
        : 1;

    return {
      id: row.id,
      source: row.source,
      type: row.type ?? '',
      occurred_at: row.occurred_at,
      author: row.author,
      source_id: row.source_id ?? null,
      content: buildSignalMetadataSummary(row, threadSize),
      thread_size: threadSize,
    };
  });
}
