import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  countActionableStalePendingApprovals,
  isHealthCiRelaxedMode,
} from '../health-checks';

describe('isHealthCiRelaxedMode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is false when CI is not set (local strict health)', () => {
    vi.stubEnv('CI', undefined);
    vi.stubEnv('HEALTH_STRICT_PRODUCTION', undefined);
    expect(isHealthCiRelaxedMode()).toBe(false);
  });

  it('is false when CI is set and HEALTH_STRICT_PRODUCTION=1', () => {
    vi.stubEnv('CI', 'true');
    vi.stubEnv('HEALTH_STRICT_PRODUCTION', '1');
    expect(isHealthCiRelaxedMode()).toBe(false);
  });

  it('is true on GitHub Actions when not forcing strict', () => {
    vi.stubEnv('CI', 'true');
    vi.stubEnv('HEALTH_STRICT_PRODUCTION', undefined);
    expect(isHealthCiRelaxedMode()).toBe(true);
  });
});

describe('countActionableStalePendingApprovals', () => {
  it('does not count selected-move requirements-needed blocker packets as stale actionable approvals', () => {
    const count = countActionableStalePendingApprovals([
      {
        id: 'requirements-packet',
        action_type: 'write_document',
        directive_text:
          'Write a decision memo that closes "Submit high-quality .docx documents for document collection" with the owner, next action, and deadline.',
        artifact: {
          title: 'Requirements needed: Submit high-quality .docx documents for document collection',
          content:
            'REQUIREMENTS-NEEDED PACKET\nTo finish this, provide: owned .docx/source files, document topics/titles, and submission URL.',
        },
        execution_result: {
          brief_origin: 'selected_move_generate',
          selected_winner_fingerprint:
            'claim:commitment due in 0d: submit high-quality .docx documents for document collection|refs:commitment:1',
        },
      },
    ]);

    expect(count).toBe(0);
  });

  it('still counts stale finished pending approvals as actionable health failures', () => {
    const count = countActionableStalePendingApprovals([
      {
        id: 'finished-action',
        action_type: 'write_document',
        directive_text: 'Finalize the packet owner memo.',
        artifact: {
          title: 'Packet owner memo',
          content: 'Assign Holly as owner before 4 PM PT.',
        },
        execution_result: {
          brief_origin: 'dashboard_generate',
        },
      },
    ]);

    expect(count).toBe(1);
  });
});
