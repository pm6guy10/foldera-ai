import { expect, test } from '@playwright/test';

// Section order for the product-led landing (issue #378 amber overhaul).
const orderedSections = [
  'landing-hero',
  'landing-connectors',
  'landing-stats',
  'landing-pain',
  'landing-doctrine',
  'landing-trust',
  'landing-enterprise',
  'landing-pilot',
  'landing-final-cta',
  'landing-footer',
];

test.describe('Landing sections', () => {
  test('renders the product-led sections in order with the access/login CTA contract', async ({ page }) => {
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

    // Access CTAs route to /start, login CTAs route to /login.
    for (const testId of [
      'landing-primary-access-cta',
      'landing-pilot-access-cta',
      'landing-final-access-cta',
    ]) {
      await expect(page.getByTestId(testId)).toHaveAttribute('href', '/start');
    }
    await expect(page.getByTestId('landing-final-login-cta')).toHaveAttribute('href', '/login');
  });

  test('has no horizontal overflow at 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
