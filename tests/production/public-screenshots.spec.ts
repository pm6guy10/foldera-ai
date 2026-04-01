import { test } from '@playwright/test';
import path from 'node:path';

const OUT = path.join(__dirname, 'screenshots');

const paths = [
  ['home', '/'],
  ['login', '/login'],
  ['start', '/start'],
  ['pricing', '/pricing'],
  ['blog', '/blog'],
  ['blog-first-post', '/blog/ai-email-assistant'],
  ['try', '/try'],
  ['not-found', '/not-found-test-route-xyz'],
  ['privacy', '/privacy'],
  ['terms', '/terms'],
] as const;

for (const [name, url] of paths) {
  test(`screenshot ${name}`, async ({ page }) => {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => page.goto(url));
    await page.screenshot({
      path: path.join(OUT, `${name}.png`),
      fullPage: true,
    });
  });
}
