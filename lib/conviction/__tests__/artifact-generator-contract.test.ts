import { describe, expect, it } from 'vitest';
import {
  generateArtifact,
  getArtifactPersistenceIssues,
  getSendMessageRecipientGroundingIssues,
} from '../artifact-generator';

describe('artifact-generator export contract', () => {
  it('exposes the legacy symbols used by current callers', () => {
    expect(typeof generateArtifact).toBe('function');
    expect(typeof getSendMessageRecipientGroundingIssues).toBe('function');
    expect(typeof getArtifactPersistenceIssues).toBe('function');
  });
});
