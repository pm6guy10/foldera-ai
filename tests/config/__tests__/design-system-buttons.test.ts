import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function collectTsxFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(fullPath);
    return entry.name.endsWith('.tsx') ? [fullPath] : [];
  });
}

describe('design system button primitives', () => {
  it('keeps raw touch-height and button-radius primitives out of TSX files', () => {
    const root = process.cwd();
    const files = [
      ...collectTsxFiles(path.join(root, 'app')),
      ...collectTsxFiles(path.join(root, 'components')),
    ];

    const violations = files
      .filter((filePath) => {
        const source = fs.readFileSync(filePath, 'utf8');
        return source.includes('rounded-button') || source.includes('min-h-[48px]');
      })
      .map((filePath) => path.relative(root, filePath));

    expect(violations).toEqual([]);
  });
});
