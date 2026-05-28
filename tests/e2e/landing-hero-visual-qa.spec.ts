import { expect, test, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const OUT_DIR = path.join(process.cwd(), '.screenshots', 'landing-hero');
const AUDIT_PATH = path.join(OUT_DIR, 'visual-audit.json');

type ViewportConfig = {
  name: string;
  width: number;
  height: number;
  dpr?: number;
};

const viewports: ViewportConfig[] = [
  { name: 'mobile-390x844', width: 390, height: 844, dpr: 3 },
  { name: 'tablet-768x1024', width: 768, height: 1024, dpr: 2 },
  { name: 'desktop-1440x1600', width: 1440, height: 1600, dpr: 1 },
];

async function addFailureOverlay(page: Page, failures: string[]) {
  await page.evaluate((messages) => {
    const overlay = document.createElement('div');
    overlay.setAttribute('data-testid', 'landing-visual-qa-overlay');
    overlay.style.position = 'fixed';
    overlay.style.left = '12px';
    overlay.style.right = '12px';
    overlay.style.bottom = '12px';
    overlay.style.zIndex = '2147483647';
    overlay.style.padding = '12px';
    overlay.style.border = '1px solid rgba(248,113,113,0.8)';
    overlay.style.borderRadius = '12px';
    overlay.style.background = 'rgba(15,23,42,0.94)';
    overlay.style.color = '#fecaca';
    overlay.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, monospace';
    overlay.style.fontSize = '11px';
    overlay.style.lineHeight = '1.45';
    overlay.style.boxShadow = '0 20px 80px rgba(0,0,0,0.45)';
    overlay.textContent = messages.join(' | ');
    document.body.appendChild(overlay);
  }, failures);
}

test.describe('landing hero visual QA', () => {
  test('captures responsive landing proof and enforces obvious production polish', async ({ browser }) => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const failures: string[] = [];
    const audit = {
      generatedAt: new Date().toISOString(),
      viewports: [] as unknown[],
      failures: [] as string[],
    };

    for (const viewport of viewports) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.dpr ?? 1,
      });
      const page = await context.newPage();
      await page.goto('/?qa=landing-visual', { waitUntil: 'networkidle' });
      await page.screenshot({ path: path.join(OUT_DIR, `${viewport.name}.png`), fullPage: true });

      const entry: Record<string, unknown> = { viewport };
      const bodyWidth = await page.locator('body').evaluate((node) => node.scrollWidth);
      const htmlWidth = await page.locator('html').evaluate((node) => node.scrollWidth);
      const maxWidth = Math.max(bodyWidth, htmlWidth);
      entry.maxDocumentWidth = maxWidth;
      if (maxWidth > viewport.width + 1) {
        failures.push(`Horizontal overflow (${viewport.name}): document ${maxWidth}px > viewport ${viewport.width}px`);
      }

      await expect(page.getByTestId('landing-header')).toHaveCount(1);
      await expect(page.getByTestId('landing-footer')).toHaveCount(1);
      await expect(page.getByTestId('landing-visual-hero')).toHaveCount(1);
      await expect(page.getByRole('heading', { name: /foldera hands back the work/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /join pilot/i }).first()).toBeVisible();

      const heroBox = await page.getByTestId('landing-visual-hero').boundingBox();
      entry.heroBox = heroBox;
      if (!heroBox || heroBox.width < viewport.width * 0.98) {
        failures.push(`Native hero too narrow (${viewport.name}): ${heroBox?.width ?? 0}px`);
      }

      for (const slideNumber of [1, 2, 3, 4, 5, 6]) {
        await expect(page.getByTestId(`landing-slide-${slideNumber}`)).toHaveCount(1);
      }
      await expect(page.getByTestId('landing-cta-1')).toHaveCount(1);
      await expect(page.getByTestId('landing-cta-6')).toHaveCount(1);
      await expect(page.locator('[data-testid^="landing-cta-"]')).toHaveCount(2);

      const firstCtaBox = await page.getByTestId('landing-cta-1').boundingBox();
      entry.firstCtaBox = firstCtaBox;
      if (!firstCtaBox || firstCtaBox.width < 120 || firstCtaBox.height < 32) {
        failures.push(`Hero CTA hotspot too small (${viewport.name}): ${JSON.stringify(firstCtaBox)}`);
      }

      const finalCtaBox = await page.getByTestId('landing-cta-6').boundingBox();
      entry.finalCtaBox = finalCtaBox;
      if (!finalCtaBox || finalCtaBox.width < 180 || finalCtaBox.height < 36) {
        failures.push(`Final CTA hotspot too small (${viewport.name}): ${JSON.stringify(finalCtaBox)}`);
      }

      const pageFacts = await page.evaluate(() => ({
        text: document.body.innerText.slice(0, 1800),
        imageCount: document.images.length,
      }));
      entry.textSample = pageFacts.text;
      entry.imageCount = pageFacts.imageCount;
      if (pageFacts.imageCount < 6) {
        failures.push(`Expected at least 6 landing images (${viewport.name}), saw ${pageFacts.imageCount}`);
      }

      const unsupportedClaimMatches = await page
        .locator('body')
        .evaluate((node) => node.innerText.match(/SOC 2|HIPAA|Slack sends live|Teams sends live|auto-send|automatic writeback/gi) || []);
      entry.unsupportedClaimMatches = unsupportedClaimMatches;
      if (unsupportedClaimMatches.length) {
        failures.push(`Unsupported claim text found (${viewport.name}): ${unsupportedClaimMatches.join(', ')}`);
      }

      const sectionBoxes = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('[data-testid]')) as HTMLElement[];
        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        const boxes = nodes
          .map((node) => ({ node, id: node.getAttribute('data-testid') || '' }))
          .filter(({ id }) => /^landing-slide-\d+$/.test(id))
          .map(({ node, id }) => {
            const rect = node.getBoundingClientRect();
            return { id, top: rect.top + scrollY, bottom: rect.bottom + scrollY };
          });
        boxes.sort((a, b) => a.top - b.top);
        return boxes;
      });
      const gaps: number[] = [];
      for (let i = 0; i < sectionBoxes.length - 1; i++) {
        gaps.push(Math.round(sectionBoxes[i + 1]!.top - sectionBoxes[i]!.bottom));
      }
      entry.gaps = gaps;
      const maxGap = viewport.width < 640 ? 32 : viewport.width < 1024 ? 40 : 56;
      if (gaps.some((gap) => gap < 0 || gap > maxGap)) {
        failures.push(`Storyboard rhythm out of range (${viewport.name}): expected 0-${maxGap}px, got [${gaps.join(', ')}]`);
      }

      (audit.viewports as unknown[]).push(entry);
      await context.close();
    }

    audit.failures = failures;
    fs.writeFileSync(AUDIT_PATH, JSON.stringify(audit, null, 2));

    if (failures.length) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
      const page = await context.newPage();
      await page.goto('/?qa=landing-visual', { waitUntil: 'networkidle' });
      await addFailureOverlay(page, failures.slice(0, 8));
      await page.screenshot({ path: path.join(OUT_DIR, 'landing-hero-annotated-fail.png'), fullPage: true });
      await context.close();
      throw new Error(`Landing visual QA gate failed:\n- ${failures.join('\n- ')}`);
    }
  });
});
