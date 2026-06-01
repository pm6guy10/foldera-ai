const SECRET_VALUE_PATTERNS = [
  /xox[baprs]-[A-Za-z0-9-]+/g,
  /\b[A-Za-z0-9_=-]{32,}\b/g,
];

const SECRET_KEY_PATTERN = /(token|secret|authorization|signature)/i;

export const REDACTED_SECRET = '[REDACTED_SECRET]';

export function redactSlackSecret(value: unknown): unknown {
  if (typeof value === 'string') {
    return SECRET_VALUE_PATTERNS.reduce(
      (current, pattern) => current.replace(pattern, REDACTED_SECRET),
      value,
    );
  }

  if (Array.isArray(value)) return value.map((item) => redactSlackSecret(item));

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SECRET_KEY_PATTERN.test(key) ? REDACTED_SECRET : redactSlackSecret(entry),
      ]),
    );
  }

  return value;
}

