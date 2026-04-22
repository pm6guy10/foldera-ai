import { describe, expect, it } from 'vitest';
import { buildRepeatedDirectiveCheck, countBlockingFailures, warningCheck } from '../health-checks';

describe('health check severity routing', () => {
  it('keeps warning-only runs at zero blocking failures', () => {
    const checks = [
      warningCheck('Gmail stale', '3d ago — check sync / ingest'),
      warningCheck('Outlook fresh', '(no Microsoft mailbox connected)'),
      warningCheck('Mail cursors stale', 'google 2d ago'),
      warningCheck('Last generation', 'GENERATION_FAILED'),
    ];

    expect(countBlockingFailures(checks)).toBe(0);
  });

  it('treats active repeated directives as a blocking failure', () => {
    const repeated = buildRepeatedDirectiveCheck(
      {
        status: 'active_regression',
        maxCopies: 3,
        dominantShapeKey: 'Email Alex about the permit appeal deadline.',
        dominantLatestGeneratedAt: '2026-04-21T23:00:00.000Z',
        latestRowGeneratedAt: '2026-04-21T23:00:00.000Z',
        latestRowProtectedDuplicateBlock: false,
      },
      () => '30m ago',
    );

    expect(repeated.group).toBe('blocking');
    expect(repeated.status).toBe('fail');
    expect(repeated.line).toContain('Repeated directive');
    expect(countBlockingFailures([repeated])).toBe(1);
  });

  it('downgrades duplicate backlog to a warning', () => {
    const duplicateBacklog = buildRepeatedDirectiveCheck(
      {
        status: 'historical_backlog',
        maxCopies: 4,
        dominantShapeKey: 'Email Alex about the permit appeal deadline.',
        dominantLatestGeneratedAt: '2026-04-20T12:00:00.000Z',
        latestRowGeneratedAt: '2026-04-20T12:00:00.000Z',
        latestRowProtectedDuplicateBlock: false,
      },
      () => '1d ago',
    );

    expect(duplicateBacklog.group).toBe('warning');
    expect(duplicateBacklog.status).toBe('warn');
    expect(duplicateBacklog.line).toContain('Duplicate backlog');
    expect(countBlockingFailures([duplicateBacklog])).toBe(0);
  });
});
