export interface SignalMetadataRow {
  id: string;
  user_id?: string | null;
  source: string;
  type: string | null;
  occurred_at: string;
  author: string | null;
  source_id?: string | null;
  recipients?: unknown;
  extracted_entities?: unknown;
  extracted_commitments?: unknown;
  extracted_dates?: unknown;
  extracted_amounts?: unknown;
  outcome_label?: string | null;
  processed?: boolean | null;
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

function compactValue(value: unknown, maxItems = 8): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          return String(obj.name ?? obj.text ?? obj.description ?? obj.value ?? JSON.stringify(obj)).trim();
        }
        return String(item ?? '').trim();
      })
      .filter(Boolean)
      .slice(0, maxItems);
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      return compactValue(JSON.parse(value), maxItems);
    } catch {
      return [value.trim()].slice(0, maxItems);
    }
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .flatMap((item) => compactValue(item, maxItems))
      .slice(0, maxItems);
  }
  return [];
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

  const recipients = compactValue(row.recipients, 5);
  if (recipients.length > 0) lines.push(`Recipients: ${recipients.join(', ')}`);

  const entities = compactValue(row.extracted_entities);
  if (entities.length > 0) lines.push(`Extracted entities: ${entities.join(', ')}`);

  const commitments = compactValue(row.extracted_commitments, 6);
  if (commitments.length > 0) lines.push(`Extracted commitments: ${commitments.join('; ')}`);

  const dates = compactValue(row.extracted_dates, 6);
  if (dates.length > 0) lines.push(`Extracted dates: ${dates.join(', ')}`);

  const amounts = compactValue(row.extracted_amounts, 6);
  if (amounts.length > 0) lines.push(`Extracted amounts: ${amounts.join(', ')}`);

  if (row.outcome_label) {
    lines.push(`Outcome: ${row.outcome_label}`);
  }

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
