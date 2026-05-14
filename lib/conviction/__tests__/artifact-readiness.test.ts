import { describe, expect, it } from 'vitest';
import {
  classifyWriteDocumentReadiness,
  deriveArtifactReadinessFromSummary,
  isFinishedArtifactReady,
  isNoSafeArtifact,
  isRequirementsNeeded,
} from '../artifact-readiness';

const FINISHED_DOCUMENT = {
  type: 'document',
  title: 'Packet owner execution brief',
  content: [
    'EXECUTION BRIEF',
    'FINAL RECOMMENDATION: assign Holly as packet owner before 4 PM PT today.',
    'OWNER: Brandon closes the owner assignment.',
    'NEXT PHYSICAL STEP: update the packet owner field and notify Holly before 4 PM PT.',
    'CONSEQUENCE IF NO MOVEMENT: the same-day handoff slips without an accountable owner.',
    'SOURCE TRAIL',
    '- Drive packet owner field is blank and the handoff closes today.',
  ].join('\n'),
};

const FINISHED_DIRECTIVE = {
  action_type: 'write_document',
  directive: 'Finalize the packet owner memo before 4 PM PT today.',
  reason: 'The packet is due today, but the owner is still missing.',
  confidence: 88,
  evidence: [{ type: 'signal', description: 'Drive packet owner field is blank; handoff closes today.' }],
  requires_search: false,
};

const REQUIREMENTS_PACKET = {
  type: 'document',
  title: 'Requirements needed: Submit high-quality .docx documents for document collection',
  content: [
    'REQUIREMENTS-NEEDED PACKET',
    'FINAL RECOMMENDATION: submit nothing and do not draft fake .docx content until the missing source requirements are present.',
    'To finish this, provide: owned .docx/source files, document topics/titles, and submission URL.',
    'Paste the submission link and list/upload the candidate documents.',
    'KNOWN REQUIREMENTS FROM SOURCE',
    '- Files must be real .docx documents.',
    '- $50 per accepted document.',
    'MISSING BEFORE FINISHED .DOCX WORK',
    '- Owned candidate .docx files or source document bodies.',
    '- Specific document topics, titles, or which owned documents to use.',
    '- Captured submission URL, upload destination, or exact handoff location.',
  ].join('\n'),
};

describe('artifact readiness contract', () => {
  it('classifies source-backed finished write_document artifacts as FINISHED_ARTIFACT_READY', () => {
    const readiness = classifyWriteDocumentReadiness({
      directive: FINISHED_DIRECTIVE,
      artifact: FINISHED_DOCUMENT,
      persistenceIssues: [],
    });

    expect(isFinishedArtifactReady(readiness)).toBe(true);
    expect(readiness.state).toBe('FINISHED_ARTIFACT_READY');
    expect(readiness.source_evidence).toBe('sufficient');
    expect(readiness.reason).toContain('finished work');
  });

  it('classifies document-collection blocker packets as REQUIREMENTS_NEEDED with exact missing inputs', () => {
    const readiness = classifyWriteDocumentReadiness({
      directive: {
        ...FINISHED_DIRECTIVE,
        directive: 'Submit high-quality .docx documents for document collection.',
        reason: 'Deadline is today, but owned source files and submission destination are missing.',
        evidence: [
          {
            type: 'signal',
            description:
              'Handshake source says .docx documents are required, $50 per accepted document, original-owner/IP rules apply, and the deadline is May 15, 2026 at 11:59 PM PT.',
          },
        ],
      },
      artifact: REQUIREMENTS_PACKET,
      persistenceIssues: [],
    });

    expect(isRequirementsNeeded(readiness)).toBe(true);
    expect(readiness.state).toBe('REQUIREMENTS_NEEDED');
    expect(readiness.missing_inputs).toEqual(
      expect.arrayContaining([
        'owned .docx/source files',
        'document topics/titles',
        'submission URL',
      ]),
    );
    expect(readiness.known_requirements).toEqual(
      expect.arrayContaining(['Files must be real .docx documents.', '$50 per accepted document.']),
    );
    expect(JSON.stringify(readiness)).not.toMatch(/finished \.docx work is ready/i);
  });

  it('classifies write_document winners with no usable artifact as NO_SAFE_ARTIFACT', () => {
    const readiness = classifyWriteDocumentReadiness({
      directive: FINISHED_DIRECTIVE,
      artifact: null,
      persistenceIssues: ['artifact is required before persistence'],
    });

    expect(isNoSafeArtifact(readiness)).toBe(true);
    expect(readiness.state).toBe('NO_SAFE_ARTIFACT');
    expect(readiness.reason).toContain('No user-facing artifact');
  });

  it('does not treat source presence as sufficiency when the source lacks the content needed to finish', () => {
    const readiness = classifyWriteDocumentReadiness({
      directive: {
        ...FINISHED_DIRECTIVE,
        evidence: [{ type: 'signal', description: 'A source exists, but it only says a packet is needed.' }],
      },
      artifact: FINISHED_DOCUMENT,
      persistenceIssues: [],
    });

    expect(readiness.state).toBe('NO_SAFE_ARTIFACT');
    expect(readiness.source_evidence).toBe('present_but_insufficient');
  });

  it('derives the same visible state from summary rows when full execution_result is unavailable', () => {
    expect(
      deriveArtifactReadinessFromSummary({
        action_type: 'write_document',
        artifact_title: REQUIREMENTS_PACKET.title,
        artifact_preview: REQUIREMENTS_PACKET.content,
        finished_artifact_verdict: 'strict_artifact_selected',
      }).state,
    ).toBe('REQUIREMENTS_NEEDED');

    expect(
      deriveArtifactReadinessFromSummary({
        action_type: 'write_document',
        artifact_title: FINISHED_DOCUMENT.title,
        artifact_preview: FINISHED_DOCUMENT.content,
        finished_artifact_verdict: 'strict_artifact_selected',
      }).state,
    ).toBe('FINISHED_ARTIFACT_READY');

    expect(
      deriveArtifactReadinessFromSummary({
        action_type: 'write_document',
        finished_artifact_verdict: 'no_finished_artifact',
        no_safe_artifact_reason: 'missing_discrepancy_card',
      }).state,
    ).toBe('NO_SAFE_ARTIFACT');
  });
});
