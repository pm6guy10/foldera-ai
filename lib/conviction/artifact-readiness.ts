export type ArtifactReadinessState =
  | 'FINISHED_ARTIFACT_READY'
  | 'REQUIREMENTS_NEEDED'
  | 'NO_SAFE_ARTIFACT';

export type ArtifactReadiness = {
  state: ArtifactReadinessState;
  reason: string;
  source_evidence: 'sufficient' | 'present_but_insufficient' | 'missing';
  known_requirements: string[];
  missing_inputs: string[];
};

type ReadinessInput = {
  directive?: Record<string, unknown> | null;
  artifact?: unknown;
  persistenceIssues?: string[];
};

type SummaryInput = {
  action_type?: unknown;
  artifact_title?: unknown;
  artifact_preview?: unknown;
  finished_artifact_verdict?: unknown;
  no_safe_artifact_reason?: unknown;
};

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function preserveText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function artifactText(artifact: unknown): string {
  const record = asRecord(artifact);
  if (!record) return '';
  return [
    record.title,
    record.subject,
    record.body,
    record.text,
    record.content,
    record.context,
  ]
    .map(preserveText)
    .filter(Boolean)
    .join('\n');
}

function evidenceText(directive: Record<string, unknown> | null | undefined): string {
  if (!directive) return '';
  return Array.isArray(directive.evidence)
    ? directive.evidence
        .map((entry) => {
          if (typeof entry === 'string') return entry;
          const record = asRecord(entry);
          return record ? asString(record.description) ?? asString(record.summary) ?? '' : '';
        })
        .join('\n')
    : '';
}

function directiveText(directive: Record<string, unknown> | null | undefined): string {
  if (!directive) return '';
  const evidence = evidenceText(directive);
  return [
    directive.directive,
    directive.reason,
    directive.fullContext,
    evidence,
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join('\n');
}

function extractSectionBullets(text: string, headingPattern: RegExp): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => headingPattern.test(line.trim()));
  if (start < 0) return [];
  const bullets: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (bullets.length > 0) break;
      continue;
    }
    if (/^[A-Z][A-Z0-9 .'/&-]{4,}$/.test(trimmed) && bullets.length > 0) break;
    const bullet = trimmed.replace(/^[-*]\s*/, '').trim();
    if (bullet) bullets.push(bullet);
  }
  return bullets;
}

function canonicalMissingInput(value: string): string {
  const lower = value.toLowerCase();
  if (/topic|title|which owned documents/.test(lower)) return 'document topics/titles';
  if (/owned|source document|\.docx|file|body/.test(lower)) return 'owned .docx/source files';
  if (/url|link|destination|upload|handoff/.test(lower)) return 'submission URL';
  return value.replace(/[.]+$/, '').trim();
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isRequirementsNeededText(text: string): boolean {
  return (
    /\bREQUIREMENTS-NEEDED PACKET\b/i.test(text) ||
    (/\brequirements needed\b/i.test(text) &&
      /\b(?:missing|provide|to finish this|before finished)\b/i.test(text))
  );
}

function hasEnoughSourceEvidence(text: string): boolean {
  return (
    /\b(?:source trail|source signal|source commitment|source email|drive packet|handoff closes|deadline|due today|same-day|evidence)\b/i.test(text) &&
    /\b(?:owner|deadline|due|handoff|confirm|assign|accepted document|\.docx|submission)\b/i.test(text)
  );
}

function sourceEvidenceStatus(input: ReadinessInput, combinedArtifactText: string): ArtifactReadiness['source_evidence'] {
  const text = evidenceText(input.directive);
  if (!text) return 'missing';
  if (isRequirementsNeededText(combinedArtifactText)) return 'present_but_insufficient';
  return hasEnoughSourceEvidence(text) ? 'sufficient' : 'present_but_insufficient';
}

function noSafe(reason: string, source: ArtifactReadiness['source_evidence'] = 'missing'): ArtifactReadiness {
  return {
    state: 'NO_SAFE_ARTIFACT',
    reason,
    source_evidence: source,
    known_requirements: [],
    missing_inputs: [],
  };
}

export function classifyWriteDocumentReadiness(input: ReadinessInput): ArtifactReadiness {
  const actionType = asString(input.directive?.action_type);
  if (actionType && actionType !== 'write_document') {
    return noSafe('Artifact readiness only applies to write_document artifacts.');
  }

  const art = asRecord(input.artifact);
  if (!art) {
    return noSafe('No user-facing artifact exists for this write_document winner.');
  }

  const text = artifactText(art);
  const source = sourceEvidenceStatus(input, text);
  const issues = input.persistenceIssues ?? [];

  if (isRequirementsNeededText(text)) {
    const known = extractSectionBullets(text, /^KNOWN REQUIREMENTS FROM SOURCE$/i);
    const missing = extractSectionBullets(text, /^MISSING BEFORE FINISHED \.DOCX WORK$/i)
      .map(canonicalMissingInput);
    return {
      state: 'REQUIREMENTS_NEEDED',
      reason: 'Winner is valid, but the current sources do not contain every input needed to finish the document.',
      source_evidence: 'present_but_insufficient',
      known_requirements: unique(known),
      missing_inputs: unique(missing),
    };
  }

  if (issues.length > 0) {
    return noSafe(`Artifact failed readiness checks: ${issues.join('; ')}`, source);
  }

  if (source !== 'sufficient') {
    return noSafe(
      'Source evidence is present but insufficient to claim finished write_document work.',
      source,
    );
  }

  if (!normalizeText(art.content ?? art.body ?? art.text ?? art.context)) {
    return noSafe('No user-facing artifact body exists for this write_document winner.', source);
  }

  return {
    state: 'FINISHED_ARTIFACT_READY',
    reason: 'Write_document artifact is finished work and has sufficient source evidence.',
    source_evidence: 'sufficient',
    known_requirements: [],
    missing_inputs: [],
  };
}

export function deriveArtifactReadinessFromSummary(input: SummaryInput): ArtifactReadiness {
  const title = normalizeText(input.artifact_title);
  const preview = normalizeText(input.artifact_preview);
  const combined = [title, preview].filter(Boolean).join('\n');
  if (isRequirementsNeededText(combined)) {
    const missing = unique(
      [
        /owned \.docx\/source files/i.test(combined) ? 'owned .docx/source files' : '',
        /document topics\/titles/i.test(combined) ? 'document topics/titles' : '',
        /submission URL/i.test(combined) ? 'submission URL' : '',
      ].filter(Boolean),
    );
    const missingInputs =
      missing.length > 0
        ? missing
        : ['owned .docx/source files', 'document topics/titles', 'submission URL'];
    return {
      state: 'REQUIREMENTS_NEEDED',
      reason: 'Summary represents a source-backed requirements-needed packet.',
      source_evidence: 'present_but_insufficient',
      known_requirements: [],
      missing_inputs: missingInputs,
    };
  }

  if (input.finished_artifact_verdict === 'no_finished_artifact') {
    return noSafe(
      asString(input.no_safe_artifact_reason) ?? 'No safe artifact is visible for the current winner.',
      'present_but_insufficient',
    );
  }

  if (input.action_type === 'write_document' && preview) {
    return {
      state: 'FINISHED_ARTIFACT_READY',
      reason: 'Summary row represents a visible write_document artifact.',
      source_evidence: 'sufficient',
      known_requirements: [],
      missing_inputs: [],
    };
  }

  return noSafe('No write_document artifact summary is available.', 'missing');
}

export function isFinishedArtifactReady(value: ArtifactReadiness): boolean {
  return value.state === 'FINISHED_ARTIFACT_READY';
}

export function isRequirementsNeeded(value: ArtifactReadiness): boolean {
  return value.state === 'REQUIREMENTS_NEEDED';
}

export function isNoSafeArtifact(value: ArtifactReadiness): boolean {
  return value.state === 'NO_SAFE_ARTIFACT';
}
