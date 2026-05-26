import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

type Viewport = { width: number; height: number; name: string };

const OUT_DIR = path.join(process.cwd(), '.screenshots', 'landing-hero');
const AUDIT_PATH = path.join(OUT_DIR, 'visual-audit.json');

const VIEWPORTS: Viewport[] = [
  { width: 390, height: 844, name: '390x844' },
  { width: 768, height: 1024, name: '768x1024' },
  { width: 1440, height: 1600, name: '1440x1600' },
];

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function readUInt32BE(buffer: Buffer, offset: number) {
  return buffer.readUInt32BE(offset);
}

function decodePngToRGBA(buffer: Buffer): { width: number; height: number; pixels: Uint8Array } {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error('Screenshot is not a PNG.');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatChunks: Buffer[] = [];

  while (offset + 8 <= buffer.length) {
    const length = readUInt32BE(buffer, offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (crcEnd > buffer.length) break;

    if (type === 'IHDR') {
      width = readUInt32BE(buffer, dataStart);
      height = readUInt32BE(buffer, dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
      interlace = buffer[dataStart + 12];
    } else if (type === 'IDAT') {
      idatChunks.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }

    offset = crcEnd;
  }

  if (!width || !height) throw new Error('PNG missing IHDR.');
  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth ${bitDepth}.`);
  if (colorType !== 6 && colorType !== 2) {
    throw new Error(`Unsupported PNG color type ${colorType} (expected RGB/RGBA).`);
  }
  if (interlace !== 0) throw new Error('Unsupported interlaced PNG.');

  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const sourceBpp = colorType === 6 ? 4 : 3;
  const sourceStride = width * sourceBpp;
  const out = new Uint8Array(width * height * 4);

  let inOffset = 0;
  const prevRow = new Uint8Array(sourceStride);
  const curRow = new Uint8Array(sourceStride);

  const paethPredictor = (a: number, b: number, c: number) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  };

  for (let y = 0; y < height; y++) {
    const filterType = inflated[inOffset++];
    curRow.set(inflated.subarray(inOffset, inOffset + sourceStride));
    inOffset += sourceStride;

    for (let x = 0; x < sourceStride; x++) {
      const raw = curRow[x]!;
      const left = x >= sourceBpp ? curRow[x - sourceBpp]! : 0;
      const up = prevRow[x]!;
      const upLeft = x >= sourceBpp ? prevRow[x - sourceBpp]! : 0;

      let recon = raw;
      if (filterType === 1) recon = (raw + left) & 0xff;
      else if (filterType === 2) recon = (raw + up) & 0xff;
      else if (filterType === 3) recon = (raw + Math.floor((left + up) / 2)) & 0xff;
      else if (filterType === 4) recon = (raw + paethPredictor(left, up, upLeft)) & 0xff;
      else if (filterType !== 0) throw new Error(`Unsupported PNG filter ${filterType}.`);
      curRow[x] = recon;
    }

    if (colorType === 6) {
      for (let x = 0; x < width; x++) {
        const s = x * 4;
        const d = (y * width + x) * 4;
        out[d] = curRow[s]!;
        out[d + 1] = curRow[s + 1]!;
        out[d + 2] = curRow[s + 2]!;
        out[d + 3] = curRow[s + 3]!;
      }
    } else {
      for (let x = 0; x < width; x++) {
        const s = x * 3;
        const d = (y * width + x) * 4;
        out[d] = curRow[s]!;
        out[d + 1] = curRow[s + 1]!;
        out[d + 2] = curRow[s + 2]!;
        out[d + 3] = 255;
      }
    }
    prevRow.set(curRow);
  }

  return { width, height, pixels: out };
}

function isNearBlack(r: number, g: number, b: number, a: number) {
  if (a < 240) return true;
  return r <= 12 && g <= 12 && b <= 14;
}

function assertEdgeColumnsBlack(png: { width: number; height: number; pixels: Uint8Array }) {
  const sampleWidth = Math.min(8, png.width);
  const stride = png.width * 4;
  const sampleEvery = 5;

  for (let y = 0; y < png.height; y += sampleEvery) {
    for (let x = 0; x < sampleWidth; x++) {
      const idx = y * stride + x * 4;
      if (!isNearBlack(png.pixels[idx]!, png.pixels[idx + 1]!, png.pixels[idx + 2]!, png.pixels[idx + 3]!)) {
        throw new Error(`Left gutter not black at y=${y}, x=${x}.`);
      }
    }
    for (let x = png.width - sampleWidth; x < png.width; x++) {
      const idx = y * stride + x * 4;
      if (!isNearBlack(png.pixels[idx]!, png.pixels[idx + 1]!, png.pixels[idx + 2]!, png.pixels[idx + 3]!)) {
        throw new Error(`Right gutter not black at y=${y}, x=${x}.`);
      }
    }
  }
}

function assertNoGrayGutters(png: { width: number; height: number; pixels: Uint8Array }) {
  const sampleWidth = Math.min(8, png.width);
  const stride = png.width * 4;
  const sampleEvery = 7;

  for (let y = 0; y < png.height; y += sampleEvery) {
    for (const x of [0, 1, 2, 3, 4, 5, 6, 7].filter((v) => v < png.width)) {
      const idx = y * stride + x * 4;
      const r = png.pixels[idx]!;
      const g = png.pixels[idx + 1]!;
      const b = png.pixels[idx + 2]!;
      const a = png.pixels[idx + 3]!;
      if (a < 240) continue;
      const nearGray = Math.abs(r - g) <= 4 && Math.abs(g - b) <= 4 && r >= 56 && r < 120;
      if (nearGray) throw new Error(`Left gutter looks gray at y=${y}, x=${x} (rgb=${r},${g},${b}).`);
    }

    for (let xi = 0; xi < sampleWidth; xi++) {
      const x = png.width - 1 - xi;
      const idx = y * stride + x * 4;
      const r = png.pixels[idx]!;
      const g = png.pixels[idx + 1]!;
      const b = png.pixels[idx + 2]!;
      const a = png.pixels[idx + 3]!;
      if (a < 240) continue;
      const nearGray = Math.abs(r - g) <= 4 && Math.abs(g - b) <= 4 && r >= 56 && r < 120;
      if (nearGray) throw new Error(`Right gutter looks gray at y=${y}, x=${x} (rgb=${r},${g},${b}).`);
    }
  }
}

async function addFailureOverlay(page: Parameters<typeof test>[0]['page'], notes: string[]) {
  await page.addStyleTag({
    content: `
      .__qa_overlay_root { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; }
      .__qa_overlay_badge { position: fixed; left: 12px; top: 12px; max-width: 92vw; background: rgba(239,68,68,0.16); border: 1px solid rgba(239,68,68,0.6); color: white; padding: 10px 12px; border-radius: 12px; font: 12px/1.4 ui-sans-serif, system-ui; }
      .__qa_overlay_box { position: fixed; left: 0; top: 0; right: 0; bottom: 0; border: 3px dashed rgba(239,68,68,0.7); }
    `,
  });
  await page.evaluate((notesIn) => {
    const root = document.createElement('div');
    root.className = '__qa_overlay_root';
    const box = document.createElement('div');
    box.className = '__qa_overlay_box';
    const badge = document.createElement('div');
    badge.className = '__qa_overlay_badge';
    badge.textContent = `Landing visual QA failed:\n${notesIn.join('\n')}`;
    root.appendChild(box);
    root.appendChild(badge);
    document.body.appendChild(root);
  }, notes);
}

test.describe('Landing page visual QA gate', () => {
  test('passes framing + gutters + hotspots + rhythm', async ({ page }) => {
    ensureOutDir();

    const audit: Record<string, unknown> = {
      at: new Date().toISOString(),
      url: '/',
      viewports: [],
    };

    const failures: string[] = [];

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');

      const screenshotPath = path.join(OUT_DIR, `landing-hero-${viewport.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });

      const slideFrames = page.getByTestId('landing-slide-frame');
      const slideAspects = page.getByTestId('landing-slide-aspect');

      const firstAspect = slideAspects.nth(0);
      const firstBox = await firstAspect.boundingBox();
      if (!firstBox) throw new Error('Could not measure slide 1 bounding box.');

      const viewportWidth = viewport.width;
      const leftGap = firstBox.x;
      const rightGap = viewportWidth - (firstBox.x + firstBox.width);

      const entry: Record<string, unknown> = {
        name: viewport.name,
        width: viewport.width,
        height: viewport.height,
        leftGap,
        rightGap,
        firstWidth: firstBox.width,
      };

      if (viewport.width < 640) {
        try {
          expect(leftGap).toBeLessThanOrEqual(4);
          expect(rightGap).toBeLessThanOrEqual(4);
          expect(firstBox.width).toBeGreaterThanOrEqual(viewportWidth * 0.98);
        } catch {
          failures.push(`Mobile full-bleed failed (${viewport.name}): leftGap=${leftGap.toFixed(1)} rightGap=${rightGap.toFixed(1)} width=${firstBox.width.toFixed(1)}/${viewportWidth}`);
        }

        const frameStyles = await slideFrames.nth(0).evaluate((node) => {
          const style = getComputedStyle(node as HTMLElement);
          return {
            borderTopWidth: style.borderTopWidth,
            borderRadius: style.borderRadius,
          };
        });
        entry.frameStyles = frameStyles;

        if (frameStyles.borderTopWidth !== '0px') {
          failures.push(`Mobile frame border active (${viewport.name}): borderTopWidth=${frameStyles.borderTopWidth}`);
        }
        if (frameStyles.borderRadius !== '0px') {
          failures.push(`Mobile frame radius active (${viewport.name}): borderRadius=${frameStyles.borderRadius}`);
        }

        try {
          const png = decodePngToRGBA(fs.readFileSync(screenshotPath));
          assertNoGrayGutters(png);
        } catch (err) {
          failures.push(`Mobile gutters not black (${viewport.name}): ${(err as Error).message}`);
        }

        for (const slideIndex of [1, 6]) {
          const cta = page.getByTestId(`landing-cta-${slideIndex}`);
          await expect(cta).toHaveCount(1);
          const box = await cta.boundingBox();
          if (!box || box.width < 5 || box.height < 5) {
            failures.push(`CTA hotspot box invalid on slide ${slideIndex} (${viewport.name}).`);
            continue;
          }
          await cta.click();
          await expect(page).toHaveURL(/\/start\/?$/);
          await page.goBack();
        }
      } else {
        const firstFrameBox = await slideFrames.nth(0).boundingBox();
        if (firstFrameBox) {
          entry.firstFrame = firstFrameBox;
          const expectedMax = viewport.width >= 768 ? 560 : viewport.width;
          if (firstFrameBox.width > expectedMax) {
            failures.push(`Desktop/tablet frame too wide (${viewport.name}): ${firstFrameBox.width.toFixed(1)}px`);
          }
          const centeredDelta = Math.abs(firstFrameBox.x - (viewport.width - firstFrameBox.width) / 2);
          if (centeredDelta > 14) {
            failures.push(`Desktop/tablet frame not centered (${viewport.name}): delta=${centeredDelta.toFixed(1)}px`);
          }
        }

        await expect(page.getByTestId('landing-header')).toHaveCount(1);
        await expect(page.getByTestId('landing-footer')).toHaveCount(1);
      }

      const gapBounds =
        viewport.width < 640
          ? { min: 40, max: 56 }
          : viewport.width < 1024
            ? { min: 56, max: 72 }
            : { min: 72, max: 96 };

      const sectionBoxes = await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('[data-testid]')) as HTMLElement[];
        const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
        const boxes = nodes
          .map((node) => {
            const id = node.getAttribute('data-testid') || '';
            return { node, id };
          })
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
      if (gaps.some((gap) => gap < gapBounds.min || gap > gapBounds.max)) {
        failures.push(
          `Vertical rhythm out of range (${viewport.name}): expected ${gapBounds.min}-${gapBounds.max}px, got [${gaps.join(', ')}]`,
        );
      }

      (audit.viewports as unknown[]).push(entry);
    }

    audit.failures = failures;
    fs.writeFileSync(AUDIT_PATH, JSON.stringify(audit, null, 2));

    if (failures.length) {
      await addFailureOverlay(page, failures.slice(0, 8));
      await page.screenshot({ path: path.join(OUT_DIR, 'landing-hero-annotated-fail.png'), fullPage: true });
      throw new Error(`Landing visual QA gate failed:\n- ${failures.join('\n- ')}`);
    }
  });
});
