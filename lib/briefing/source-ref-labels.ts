const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

const INTERNAL_SOURCE_REF_PATTERN =
  /\b(?:candidate|candidate_id|missing_[a-z0-9_]+|weak_[a-z0-9_]+|gate|blocker|winnerQualityTrace)\b/i;

const SOURCE_KIND_LABELS: Record<string, string> = {
  artifact: 'Prepared artifact',
  azure_ad: 'Microsoft source',
  calendar: 'Calendar event',
  commitment: 'Saved commitment',
  current: 'Current source trail',
  document: 'Source document',
  drive: 'Source document',
  email: 'Email thread',
  gmail: 'Email thread',
  google: 'Google source',
  microsoft: 'Microsoft source',
  outlook: 'Microsoft source',
  persisted: 'Safety receipt',
  signal: 'Source signal',
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function formatSourceRefLabel(value: unknown): string | null {
  const text = asNonEmptyString(value);
  if (!text) return null;
  if (INTERNAL_SOURCE_REF_PATTERN.test(text)) return null;

  const normalized = text.toLowerCase();
  if (normalized === 'current-source-trail' || normalized === 'current-winner-truth') {
    return 'Current source trail';
  }

  const [kind] = normalized.split(':', 1);
  if (text.includes(':')) {
    return SOURCE_KIND_LABELS[kind] ?? 'Connected source evidence';
  }

  if (UUID_PATTERN.test(text)) return 'Connected source evidence';
  return text;
}

export function formatSourceRefLabels(
  value: unknown,
  fallback = 'Current source trail',
): string[] {
  if (!Array.isArray(value)) return [fallback];
  const labels = uniq(
    value
      .map((entry) => formatSourceRefLabel(entry))
      .filter((entry): entry is string => Boolean(entry))
      .slice(0, 4),
  );
  return labels.length > 0 ? labels : [fallback];
}
