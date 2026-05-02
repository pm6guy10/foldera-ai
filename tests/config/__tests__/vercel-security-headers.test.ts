import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type HeaderRule = {
  key: string;
  value: string;
};

type HeaderConfig = {
  source: string;
  headers: HeaderRule[];
};

function getGlobalHeaderMap() {
  const configPath = path.join(process.cwd(), 'vercel.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as { headers?: HeaderConfig[] };
  const globalHeaders = parsed.headers?.find((rule) => rule.source === '/(.*)');
  return new Map(globalHeaders?.headers.map((header) => [header.key, header.value]) ?? []);
}

describe('vercel.json security headers', () => {
  it('defines the required hardened headers, including a conservative CSP', () => {
    const headers = getGlobalHeaderMap();
    const csp = headers.get('Content-Security-Policy');

    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('X-XSS-Protection')).toBe('1; mode=block');
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' https:");
    expect(csp).toContain("style-src 'self' 'unsafe-inline' https:");
    expect(csp).toContain("connect-src 'self' https: ws: wss:");
    expect(csp).toContain("img-src 'self' data: blob: https:");
    expect(csp).toContain("font-src 'self' data: https:");
    expect(csp).toContain("frame-src 'self' https:");
    expect(csp).toContain("form-action 'self' https:");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });
});
