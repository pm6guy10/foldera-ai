import { expect, test } from '@playwright/test';

// Section order for the imported "Foldera Landing" design (issue #500).
const orderedSections = [
  'landing-hero',
  'landing-connectors',
  'landing-product',
  'landing-tax',
  'landing-presence',
  'landing-trust',
  'landing-pilot',
  'landing-footer',
];

test.describe('Landing sections', () => {
  test('renders the presence-layer sections in order with the access/login CTA contract', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    // Every section present and in document order.
    let previousTop = -Infinity;
    for (const testId of orderedSections) {
      const section = page.getByTestId(testId);
      await expect(section).toBeVisible();
      const box = await section.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(previousTop - 1);
      previousTop = box!.y;
    }

    // Access CTAs route to /start (unauthenticated funnel entry).
    for (const testId of ['landing-header-cta', 'landing-primary-access-cta', 'landing-pilot-access-cta']) {
      await expect(page.getByTestId(testId)).toHaveAttribute('href', '/start');
    }
    // Sign-in routes to /login; demo routes to /demo.
    await expect(page.getByTestId('landing-login-cta')).toHaveAttribute('href', '/login');
    await expect(page.getByTestId('landing-demo-link')).toHaveAttribute('href', '/demo');
  });

  test('has no horizontal overflow at 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
