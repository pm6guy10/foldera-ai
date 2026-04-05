import { describe, expect, it } from 'vitest';
import {
  buildDiagnosticLensBlock,
  getVagueMechanismIssues,
} from '../diagnostic-lenses';

describe('buildDiagnosticLensBlock', () => {
  it('returns career lens for career', () => {
    const b = buildDiagnosticLensBlock('career');
    expect(b).toContain('Career lens');
    expect(b).toContain('process windows');
  });

  it('returns financial lens for financial', () => {
    expect(buildDiagnosticLensBlock('financial')).toContain('Financial lens');
  });

  it('returns relationship lens for relationship', () => {
    expect(buildDiagnosticLensBlock('relationship')).toContain('Relationship lens');
  });

  it('returns health lens for health', () => {
    expect(buildDiagnosticLensBlock('health')).toContain('Health lens');
    expect(buildDiagnosticLensBlock('health')).toContain('non-clinical');
  });

  it('returns project lens for project', () => {
    expect(buildDiagnosticLensBlock('project')).toContain('Project lens');
  });

  it('defaults to other for null, empty, and unknown category', () => {
    const other = buildDiagnosticLensBlock('other');
    expect(buildDiagnosticLensBlock(null)).toBe(other);
    expect(buildDiagnosticLensBlock('')).toBe(other);
    expect(buildDiagnosticLensBlock('unknown_xyz')).toBe(other);
  });

  it('is case-insensitive on category', () => {
    expect(buildDiagnosticLensBlock('CAREER')).toContain('Career lens');
  });
});

describe('getVagueMechanismIssues', () => {
  it('flags generic busy / time / prioritize phrases', () => {
    expect(getVagueMechanismIssues('The user is busy and has not replied')).toContain(
      'causal_diagnosis:vague_mechanism_generic_busy',
    );
    expect(getVagueMechanismIssues('They lack time to respond')).toContain(
      'causal_diagnosis:vague_mechanism_time',
    );
    expect(getVagueMechanismIssues('She needs to prioritize this thread')).toContain(
      'causal_diagnosis:vague_mechanism_prioritize',
    );
  });

  it('returns empty for empty mechanism string', () => {
    expect(getVagueMechanismIssues('')).toEqual([]);
  });

  it('allows specific mechanisms', () => {
    expect(
      getVagueMechanismIssues(
        'Uncertainty about pricing approval from the CFO before replying to the vendor deadline on 2026-04-12.',
      ),
    ).toEqual([]);
  });
});
