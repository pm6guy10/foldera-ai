import { expect } from 'vitest';

type SharedShapeOptions = {
  minLength?: number;
  dateAnchors?: string[];
  requiredTerms?: string[];
  requiredRegexes?: RegExp[];
  forbiddenPatterns?: Array<string | RegExp>;
};

type DocumentShapeOptions = SharedShapeOptions & {
  minTitleLength?: number;
  minParagraphs?: number;
  titleRequiredTerms?: string[];
  titleRequiredRegexes?: RegExp[];
  titleForbiddenPatterns?: Array<string | RegExp>;
};

type EmailShapeOptions = SharedShapeOptions & {
  expectedRecipient?: string;
  minSubjectLength?: number;
  minBodyLength?: number;
  requireQuestion?: boolean;
  subjectRequiredRegexes?: RegExp[];
  bodyRequiredRegexes?: RegExp[];
};

function toText(value: unknown): string {
  expect(typeof value).toBe('string');
  return String(value).trim();
}

function expectSharedShape(text: string, options: SharedShapeOptions = {}): string {
  expect(text.length).toBeGreaterThanOrEqual(options.minLength ?? 1);

  for (const anchor of options.dateAnchors ?? []) {
    expect(text).toContain(anchor);
  }

  for (const term of options.requiredTerms ?? []) {
    expect(text).toContain(term);
  }

  for (const pattern of options.requiredRegexes ?? []) {
    expect(text).toMatch(pattern);
  }

  for (const pattern of options.forbiddenPatterns ?? []) {
    if (typeof pattern === 'string') {
      expect(text).not.toContain(pattern);
    } else {
      expect(text).not.toMatch(pattern);
    }
  }

  return text;
}

export function expectDirectiveShape(value: unknown, options: SharedShapeOptions = {}): string {
  return expectSharedShape(toText(value), { minLength: 24, ...options });
}

export function expectDocumentArtifactShape(
  artifact: unknown,
  options: DocumentShapeOptions = {},
): { title: string; content: string } {
  const record = artifact as Record<string, unknown> | null | undefined;
  const title = expectSharedShape(toText(record?.title), {
    minLength: options.minTitleLength ?? 12,
    requiredTerms: options.titleRequiredTerms,
    requiredRegexes: options.titleRequiredRegexes,
    forbiddenPatterns: options.titleForbiddenPatterns,
  });
  const content = expectSharedShape(toText(record?.content), {
    minLength: options.minLength ?? 80,
    dateAnchors: options.dateAnchors,
    requiredTerms: options.requiredTerms,
    requiredRegexes: options.requiredRegexes,
    forbiddenPatterns: options.forbiddenPatterns,
  });

  if (options.minParagraphs) {
    const paragraphs = content
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .filter(Boolean);
    expect(paragraphs.length).toBeGreaterThanOrEqual(options.minParagraphs);
  }

  return { title, content };
}

export function expectEmailArtifactShape(
  artifact: unknown,
  options: EmailShapeOptions = {},
): { to: string; subject: string; body: string } {
  const record = artifact as Record<string, unknown> | null | undefined;
  const to = toText(record?.to);
  expect(to).toContain('@');
  if (options.expectedRecipient) {
    expect(to.toLowerCase()).toBe(options.expectedRecipient.toLowerCase());
  }

  const subject = expectSharedShape(toText(record?.subject), {
    minLength: options.minSubjectLength ?? 8,
    dateAnchors: options.dateAnchors,
    requiredTerms: options.requiredTerms,
    requiredRegexes: options.subjectRequiredRegexes ?? options.requiredRegexes,
    forbiddenPatterns: options.forbiddenPatterns,
  });
  const body = expectSharedShape(toText(record?.body), {
    minLength: options.minBodyLength ?? 40,
    dateAnchors: options.dateAnchors,
    requiredTerms: options.requiredTerms,
    requiredRegexes: options.bodyRequiredRegexes ?? options.requiredRegexes,
    forbiddenPatterns: options.forbiddenPatterns,
  });

  if (options.requireQuestion) {
    expect(body.includes('?')).toBe(true);
  }

  return { to, subject, body };
}
