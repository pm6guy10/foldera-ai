import { expect, test } from '@playwright/test';

const expectedImages = [
  '/landing/mobile-sections/01.jpg',
  '/landing/mobile-sections/02.jpg',
  '/landing/mobile-sections/03.jpg',
  '/landing/mobile-sections/04.jpg',
  '/landing/mobile-sections/05.jpg',
  '/landing/mobile-sections/06.jpg',
];

test.describe('Landing mobile section assets', () => {
  test('renders six sections in order with CTA only on 1 and 6', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    for (let i = 0; i < expectedImages.length; i += 1) {
      const slide = page.getByTestId(`landing-slide-${i + 1}`);
      await expect(slide).toBeVisible();
      const image = slide.locator('img').first();
      await expect(image).toHaveAttribute('src', new RegExp(expectedImages[i].replace('.', '\\.')));
    }

    await expect(page.getByTestId('landing-cta-1')).toHaveAttribute('href', '/start');
    await expect(page.getByTestId('landing-cta-6')).toHaveAttribute('href', '/start');
    await expect(page.getByTestId('landing-cta-2')).toHaveCount(0);
    await expect(page.getByTestId('landing-cta-3')).toHaveCount(0);
    await expect(page.getByTestId('landing-cta-4')).toHaveCount(0);
    await expect(page.getByTestId('landing-cta-5')).toHaveCount(0);
  });

  test('has no horizontal overflow at 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
