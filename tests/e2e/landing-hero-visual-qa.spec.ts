import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.join(process.cwd(), '.screenshots', 'landing-hero');

const VIEWPORTS = [
  { width: 390, height: 844, name: 'mobile-390x844' },
  { width: 768, height: 1024, name: 'tablet-768x1024' },
  { width: 1440, height: 1600, name: 'desktop-1440x1600' },
] as const;

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

test.describe('Landing page visual/access QA gate', () => {
  test('renders the code-native public shell across mobile, tablet, and desktop', async ({ page }) => {
    ensureOutDir();

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');

      await expect(page.getByTestId('landing-hero')).toBeVisible();
      await expect(page.getByRole('heading', { name: /stop rebuilding the work/i })).toBeVisible();
      await expect(page.getByTestId('landing-right-now-card')).toBeVisible();
      await expect(page.getByTestId('landing-doctrine')).toContainText('State + connectors + triggers + one intervention');
      await expect(page.getByTestId('landing-trust')).toContainText('No surveillance');
      await expect(page.getByTestId('landing-pilot')).toContainText('Pilot access');
      await expect(page.getByTestId('landing-footer')).toBeVisible();

      for (const testId of [
        'landing-header-cta',
        'landing-primary-access-cta',
        'landing-pilot-access-cta',
        'landing-final-access-cta',
      ]) {
        await expect(page.getByTestId(testId)).toHaveAttribute('href', '/start');
      }
      await expect(page.getByTestId('landing-final-login-cta')).toHaveAttribute('href', '/login');

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(viewport.width + 10);

      await page.screenshot({
        path: path.join(OUT_DIR, `landing-${viewport.name}.png`),
        fullPage: true,
      });
    }
  });
});
