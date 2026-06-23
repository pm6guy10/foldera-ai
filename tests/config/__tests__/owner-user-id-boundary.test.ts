import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const OWNER_UUID = '2cbc1bab-8e0e-43b0-bf4a-9a0cd6b5d91f';

function collectSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(fullPath);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    return [fullPath];
  });
}

describe('owner user id source boundary', () => {
  it('keeps the literal owner UUID inside lib/auth/constants.ts and tests only', () => {
    const root = process.cwd();
    const files = [
      ...collectSourceFiles(path.join(root, 'app')),
      ...collectSourceFiles(path.join(root, 'components')),
      ...collectSourceFiles(path.join(root, 'lib')),
      ...collectSourceFiles(path.join(root, 'scripts')),
    ];

    const violations = files
      .filter((filePath) => !filePath.endsWith(path.join('lib', 'auth', 'constants.ts')))
      .filter((filePath) => !filePath.includes(`${path.sep}__tests__${path.sep}`))
      .filter((filePath) => !filePath.includes(`${path.sep}tests${path.sep}`))
      .filter((filePath) => fs.readFileSync(filePath, 'utf8').includes(OWNER_UUID))
      .map((filePath) => path.relative(root, filePath));

    expect(violations).toEqual([]);
  });
});
