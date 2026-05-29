import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import sitemap from '../../../app/sitemap';

const PUBLIC_SITEMAP_PATHS = [
  '/',
  '/about',
  '/status',
  '/security',
  '/brandon-kapp',
  '/pricing',
  '/start',
  '/privacy',
  '/terms',
  '/blog',
] as const;

const PAUSED_SITEMAP_PATHS = ['/try'] as const;

describe('public presence configuration', () => {
  it('publishes robots.txt with the canonical sitemap URL', () => {
    const robotsPath = path.join(process.cwd(), 'public', 'robots.txt');

    expect(fs.existsSync(robotsPath)).toBe(true);

    const robots = fs.readFileSync(robotsPath, 'utf8');
    expect(robots).toContain('User-agent: *');
    expect(robots).toContain('Allow: /');
    expect(robots).toContain('Sitemap: https://foldera.ai/sitemap.xml');
  });

  it('includes active public routes and excludes paused public routes from the sitemap', async () => {
    const entries = await sitemap();
    const urls = new Set(entries.map((entry) => entry.url));

    for (const routePath of PUBLIC_SITEMAP_PATHS) {
      expect(urls.has(`https://foldera.ai${routePath}`)).toBe(true);
    }

    for (const routePath of PAUSED_SITEMAP_PATHS) {
      expect(urls.has(`https://foldera.ai${routePath}`)).toBe(false);
    }
  });

  it('declares a browser manifest from the root metadata', () => {
    const manifestPath = path.join(process.cwd(), 'public', 'manifest.json');
    const layoutSource = fs.readFileSync(path.join(process.cwd(), 'app', 'layout.js'), 'utf8');

    expect(layoutSource).toContain("manifest: '/manifest.json'");
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      name?: string;
      short_name?: string;
      start_url?: string;
      display?: string;
      icons?: Array<{ src?: string; sizes?: string; type?: string }>;
    };

    expect(manifest.name).toBe('Foldera');
    expect(manifest.short_name).toBe('Foldera');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons?.some((icon) => icon.src === '/foldera-icon.png')).toBe(true);
  });
});
