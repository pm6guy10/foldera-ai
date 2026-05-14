export const DOCUMENT_COLLECTION_TO_FINISH_TEXT =
  'To finish this, provide: owned .docx/source files, document topics/titles, and submission URL.';

export const DOCUMENT_COLLECTION_NEXT_ACTION_TEXT =
  'Paste the submission link and list/upload the candidate documents.';

export const DOCUMENT_COLLECTION_INTAKE_READY_NEXT_ACTION =
  'Produce the finished submission packet from the captured owned inputs.';

export type DocumentCollectionIntakePrompt = {
  heading: 'To finish this, provide';
  detail: string;
  nextAction: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function collectText(value: unknown): string {
  const record = asRecord(value);
  if (!record) return '';

  const executionResult = asRecord(record.execution_result ?? record.executionResult);
  const executionArtifact = asRecord(executionResult?.artifact);
  const columnArtifact = asRecord(record.artifact);
  const discrepancyCard = asRecord(record.discrepancy_card);

  return [
    asString(record.directive_text ?? record.directive),
    asString(record.artifact_title),
    asString(record.artifact_preview),
    asString(columnArtifact?.title),
    asString(columnArtifact?.content ?? columnArtifact?.body ?? columnArtifact?.text),
    asString(executionArtifact?.title),
    asString(executionArtifact?.content ?? executionArtifact?.body ?? executionArtifact?.text),
    asString(discrepancyCard?.claim),
    asString(discrepancyCard?.next_action),
    asString(discrepancyCard?.risk),
  ]
    .filter(Boolean)
    .join('\n');
}

export function isDocumentCollectionRequirementsText(text: string): boolean {
  return (
    /\bdocument collection\b/i.test(text) &&
    /\brequirements[-\s]?needed packet\b|\brequirements needed\b/i.test(text) &&
    /\b(?:owned \.docx|source files|source document bodies|submission url|submission link)\b/i.test(text)
  );
}

export function isDocumentCollectionRequirementsRecord(value: unknown): boolean {
  return isDocumentCollectionRequirementsText(collectText(value));
}

export function getDocumentCollectionIntakePrompt(
  value: unknown,
): DocumentCollectionIntakePrompt | null {
  if (!isDocumentCollectionRequirementsRecord(value)) return null;
  return {
    heading: 'To finish this, provide',
    detail: 'owned .docx/source files, document topics/titles, and submission URL.',
    nextAction: DOCUMENT_COLLECTION_NEXT_ACTION_TEXT,
  };
}

export function normalizeDocumentCollectionIntakeInput(input: {
  submissionUrl: unknown;
  candidateDocuments: unknown;
}): { submissionUrl: string; candidateDocuments: string; error?: string } {
  const submissionUrl = asString(input.submissionUrl);
  const candidateDocuments = asString(input.candidateDocuments);

  if (!submissionUrl) {
    return { submissionUrl, candidateDocuments, error: 'Submission URL required' };
  }
  try {
    const parsed = new URL(submissionUrl);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return { submissionUrl, candidateDocuments, error: 'HTTP submission URL required' };
    }
  } catch {
    return { submissionUrl, candidateDocuments, error: 'Valid submission URL required' };
  }

  if (candidateDocuments.length < 12) {
    return {
      submissionUrl,
      candidateDocuments,
      error: 'Candidate documents or source bodies required',
    };
  }

  return { submissionUrl, candidateDocuments };
}
