import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(process.cwd(), relativePath), 'utf8');
}

describe('read-only route cache policy', () => {
  it('keeps steady-state dashboard and settings reads off no-store', async () => {
    const [dashboardSource, settingsSource, onboardSource] = await Promise.all([
      readWorkspaceFile('app/dashboard/page.tsx'),
      readWorkspaceFile('app/dashboard/settings/SettingsClient.tsx'),
      readWorkspaceFile('app/onboard/page.tsx'),
    ]);

    // The dashboard landing performs no client data fetch (it links to /dashboard/settings),
    // so it only needs to stay off no-store; the read-cache assertions cover surfaces that fetch.
    expect(dashboardSource).not.toContain("cache: 'no-store'");
    expect(settingsSource).not.toContain("cache: 'no-store'");
    expect(settingsSource).toContain("cache: 'reload'");
    expect(onboardSource).toContain("cache: 'reload'");
  });

  it('routes share the private per-user cache helper', async () => {
    const [latestSource, historySource, detailSource, integrationsSource] = await Promise.all([
      readWorkspaceFile('app/api/conviction/latest/route.ts'),
      readWorkspaceFile('app/api/conviction/history/route.ts'),
      readWorkspaceFile('app/api/conviction/actions/[id]/route.ts'),
      readWorkspaceFile('app/api/integrations/status/route.ts'),
    ]);

    expect(latestSource).toContain('jsonWithReadOnlyUserCache');
    expect(historySource).toContain('jsonWithReadOnlyUserCache');
    expect(detailSource).toContain('jsonWithReadOnlyUserCache');
    expect(integrationsSource).toContain('withReadOnlyUserCache');
  });
});
