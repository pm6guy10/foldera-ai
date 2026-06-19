import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('component surface', () => {
  it('does not keep audited unused UI component files or exports', () => {
    const root = process.cwd();

    expect(fs.existsSync(path.join(root, 'components', 'ui', 'metric-card.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'components', 'ui', 'glass-card.tsx'))).toBe(false);
    // status-indicator.tsx was a zero-import orphan (its only importer, the dead components/layout/sidebar, was removed in #417); deleted in #425.
    expect(fs.existsSync(path.join(root, 'components', 'ui', 'status-indicator.tsx'))).toBe(false);

    const skeletonSource = fs.readFileSync(path.join(root, 'components', 'ui', 'skeleton.tsx'), 'utf8');
    expect(skeletonSource).not.toContain('export function SkeletonCard');
    expect(skeletonSource).not.toContain('export function SkeletonList');
    expect(skeletonSource).not.toContain('export function SkeletonRelationshipsPage');
    expect(skeletonSource).not.toContain('export function SkeletonSettingsPage');
  });
});
