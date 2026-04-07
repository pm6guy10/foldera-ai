/**
 * Documents the same artifact body path as docs/eval/baseline-sample.md
 * (execution_result.artifact.body || execution_result.artifact.content).
 * Keeps eval exports SQL-aligned without hitting the DB.
 */
import { describe, expect, it } from 'vitest';

function artifactBodyFromExecutionResult(executionResult: unknown): string {
  if (!executionResult || typeof executionResult !== 'object') return '';
  const er = executionResult as Record<string, unknown>;
  const artifact = er.artifact;
  if (!artifact || typeof artifact !== 'object') return '';
  const a = artifact as Record<string, unknown>;
  const body = a.body;
  const content = a.content;
  if (typeof body === 'string' && body.length > 0) return body;
  if (typeof content === 'string' && content.length > 0) return content;
  return '';
}

describe('eval artifact path (baseline-sample parity)', () => {
  it('prefers body over content when both exist', () => {
    const out = artifactBodyFromExecutionResult({
      artifact: { body: 'email', content: 'doc' },
    });
    expect(out).toBe('email');
  });

  it('uses content when body missing', () => {
    const out = artifactBodyFromExecutionResult({
      artifact: { content: 'document text' },
    });
    expect(out).toBe('document text');
  });

  it('matches empty artifact for do_nothing skips in baseline shape', () => {
    expect(artifactBodyFromExecutionResult({})).toBe('');
    expect(artifactBodyFromExecutionResult({ artifact: {} })).toBe('');
  });
});
