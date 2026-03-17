import { expect, test, type Page } from '@playwright/test';

const OWNER_USER_ID = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

function mockAuthenticatedSettingsRequests(page: Page) {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  return Promise.all([
    page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: OWNER_USER_ID,
            email: 'owner@foldera.ai',
            name: 'Owner',
          },
          expires: future,
        }),
      });
    }),
    page.route('**/api/integrations/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ integrations: [] }),
      });
    }),
    page.route('**/api/subscription/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ plan: 'pro', status: 'active' }),
      });
    }),
  ]);
}

test.describe('Settings manual brief trigger', () => {
  test('shows the sign-in prompt for signed-out visitors', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await expect(page.getByText('Please sign in to view settings')).toBeVisible();
  });

  test('renders owner trigger button and success state', async ({ page }) => {
    await mockAuthenticatedSettingsRequests(page);
    await page.route('**/api/settings/run-brief', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          generate: {
            attempted: 1,
            errors: [],
            failed: 0,
            status: 'ok',
            succeeded: 1,
            summary: 'Generated briefs for 1 eligible user.',
          },
          send: {
            attempted: 1,
            errors: [],
            failed: 0,
            status: 'ok',
            succeeded: 1,
            summary: 'Sent briefs for 1 eligible user.',
          },
        }),
      });
    });

    await page.goto('/dashboard/settings');

    const button = page.getByRole('button', { name: /run today's brief now/i });
    await expect(button).toBeVisible();
    await button.click();

    await expect(page.getByRole('button', { name: /running/i })).toBeVisible();
    await expect(page.getByText('Generated briefs for 1 eligible user.')).toBeVisible();
    await expect(page.getByText('Sent briefs for 1 eligible user.')).toBeVisible();
  });

  test('renders failure state when manual trigger fails', async ({ page }) => {
    await mockAuthenticatedSettingsRequests(page);
    await page.route('**/api/settings/run-brief', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Could not run today\'s brief right now.' }),
      });
    });

    await page.goto('/dashboard/settings');

    await page.getByRole('button', { name: /run today's brief now/i }).click();
    await expect(page.getByText('Could not run today\'s brief right now.')).toBeVisible();
  });
});
