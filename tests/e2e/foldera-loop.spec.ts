import { expect, test } from '@playwright/test';

test.describe('/foldera-loop Marcus estimate shell', () => {
  test('renders the current state, evidence, one next move, and Done action', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/foldera-loop');

    await expect(page.getByRole('heading', { name: 'Marcus estimate loop' })).toBeVisible();
    const activePanel = page.locator('[data-testid="loop-panel-active"]');
    await expect(activePanel.getByText('Current state', { exact: true })).toBeVisible();
    await expect(activePanel.getByText('Source trail', { exact: true })).toBeVisible();
    await expect(activePanel.locator('label[for="done-toggle"]')).toBeVisible();
    await expect(activePanel.getByText('Finalize revised estimate for Marcus')).toBeVisible();
    await expect(activePanel.getByText('Marcus approved the estimate.')).toBeVisible();
    await expect(activePanel.getByText('Send Estimate')).toBeVisible();

    await activePanel.locator('label[for="done-toggle"]').click();

    const completePanel = page.locator('[data-testid="loop-panel-complete"]');
    await expect(completePanel.getByText('Done recorded')).toBeVisible();
    await expect(
      completePanel.getByText('State updated. The loop is quiet again.'),
    ).toBeVisible();
    await expect(
      completePanel.getByText('Stay quiet until a new source-backed trigger appears.'),
    ).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(1280);
  });

  test('stays within the viewport on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/foldera-loop');

    await expect(page.getByRole('heading', { name: 'Marcus estimate loop' })).toBeVisible();
    await expect(page.locator('[data-testid="loop-panel-active"] label[for="done-toggle"]')).toBeVisible();

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(410);
  });
});
