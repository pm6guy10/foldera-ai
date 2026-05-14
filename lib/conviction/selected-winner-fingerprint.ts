export type SelectedWinnerFingerprintInput = {
  claim?: unknown;
  source_refs?: unknown;
  sourceRefs?: unknown;
};

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeFingerprintPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9:.-]+/g, ' ').trim();
}

export function buildSelectedWinnerFingerprint(
  input: SelectedWinnerFingerprintInput | null | undefined,
): string | null {
  if (!input) return null;
  const claim = asString(input.claim);
  const sourceRefs = asStringArray(input.source_refs ?? input.sourceRefs)
    .map(normalizeFingerprintPart)
    .filter(Boolean)
    .sort();

  if (!claim || sourceRefs.length === 0) return null;

  return [
    `claim:${normalizeFingerprintPart(claim)}`,
    `refs:${sourceRefs.join(',')}`,
  ].join('|');
}
