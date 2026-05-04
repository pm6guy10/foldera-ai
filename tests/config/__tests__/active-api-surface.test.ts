import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const VESTIGIAL_ROUTES = [
  path.join('app', 'api', 'drafts', 'propose', 'route.ts'),
  path.join('app', 'api', 'waitlist', 'route.ts'),
  path.join('app', 'api', 'priorities', 'update', 'route.ts'),
  path.join('app', 'api', 'model', 'state', 'route.ts'),
] as const;

describe('active API surface', () => {
  it('does not ship audited vestigial or test-only API route entrypoints', () => {
    const root = process.cwd();
    const stillShipped = VESTIGIAL_ROUTES.filter((routePath) => (
      fs.existsSync(path.join(root, routePath))
    ));

    expect(stillShipped).toEqual([]);
  });

  it('keeps the live system draft queue routes that are rendered by AgentSystemPanel', () => {
    const root = process.cwd();

    expect(fs.existsSync(path.join(root, 'app', 'api', 'drafts', 'pending', 'route.ts'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'app', 'api', 'drafts', 'decide', 'route.ts'))).toBe(true);
  });
});
