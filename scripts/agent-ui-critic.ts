/**
 * Optional CI/manual job: screenshots public pages → optional Sonnet UX critique → DraftQueue ingest.
 *
 * Default: screenshots + ingest with placeholder critique (no Anthropic spend).
 * Owner proof: set `ALLOW_PAID_LLM=true` for Sonnet critique (consumes credits).
 *
 * Env: CRON_SECRET; optional ANTHROPIC_API_KEY when `ALLOW_PAID_LLM=true`.
 * AGENT_UI_BASE_URL (default https://www.foldera.ai)
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import Anthropic from '@anthropic-ai/sdk';
import { assertPaidLlmAllowed, isPaidLlmAllowed } from '../lib/llm/paid-llm-gate';

const BASE = (process.env.AGENT_UI_BASE_URL || 'https://www.foldera.ai').replace(/\/$/, '');
const PAGES = ['/', '/start', '/login', '/pricing', '/blog'];
const OUT_DIR = path.join(process.cwd(), 'tests', 'production', 'screenshots');

const DESIGNER_PROMPT = `You are a senior product designer. Two screenshots are provided for the same page: first image = mobile (375px), second = desktop (1280px).

Score each viewport separately from 1-10 on: visual hierarchy, whitespace, typography, trust signals, mobile usability (for the mobile shot only score mobile usability; for desktop use N/A for that sub-score).

Respond as JSON only:
{
  "mobile": { "visual_hierarchy": n, "whitespace": n, "typography": n, "trust_signals": n, "mobile_usability": n, "lowest_dimension": "name" },
  "desktop": { "visual_hierarchy": n, "whitespace": n, "typography": n, "trust_signals": n, "mobile_usability": null, "lowest_dimension": "name" },
  "any_below_7": boolean,
  "critique": "markdown paragraph",
  "fix_prompt": "paste-ready Cursor prompt with exact CSS/class changes"
}

If all scores are >= 7, set any_below_7 to false and still give a brief critique.`;

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[ui-critic] Missing CRON_SECRET');
    process.exit(1);
  }

  const paidCritique = isPaidLlmAllowed();
  if (paidCritique && !apiKey) {
    console.error('[ui-critic] Paid critique enabled but ANTHROPIC_API_KEY is missing');
    process.exit(1);
  }
  if (paidCritique) {
    assertPaidLlmAllowed('scripts.agent-ui-critic');
  } else {
    console.log(
      '[ui-critic] ALLOW_PAID_LLM is not true — screenshots only; placeholder critique in ingest (set ALLOW_PAID_LLM=true for paid Sonnet run).',
    );
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const anthropic = paidCritique && apiKey ? new Anthropic({ apiKey }) : null;

  let totalIn = 0;
  let totalOut = 0;

  const items: Array<{
    page_path: string;
    viewport_label: string;
    scores_json: string;
    critique: string;
    fix_prompt: string;
    below_seven: boolean;
  }> = [];

  try {
    for (const pagePath of PAGES) {
      const context = await browser.newContext();
      const page = await context.newPage();

      const mobilePath = path.join(
        OUT_DIR,
        `ui-critic-${pagePath.replace(/\//g, '_') || 'home'}-375.png`,
      );
      const desktopPath = path.join(
        OUT_DIR,
        `ui-critic-${pagePath.replace(/\//g, '_') || 'home'}-1280.png`,
      );

      await page.setViewportSize({ width: 375, height: 800 });
      await page.goto(`${BASE}${pagePath}`, { waitUntil: 'networkidle', timeout: 45000 });
      await page.screenshot({ path: mobilePath, fullPage: false });

      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${BASE}${pagePath}`, { waitUntil: 'networkidle', timeout: 45000 });
      await page.screenshot({ path: desktopPath, fullPage: false });

      await context.close();

      if (!anthropic) {
        items.push({
          page_path: pagePath,
          viewport_label: '375+1280',
          scores_json: '{}',
          critique:
            'Paid LLM skipped. Set ALLOW_PAID_LLM=true for Sonnet UX critique (owner proof run). Screenshots saved under tests/production/screenshots.',
          fix_prompt: '',
          below_seven: false,
        });
        continue;
      }

      const mBuf = fs.readFileSync(mobilePath);
      const dBuf = fs.readFileSync(desktopPath);

      const res = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: DESIGNER_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: `Page path: ${pagePath}` },
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: mBuf.toString('base64') },
              },
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: dBuf.toString('base64') },
              },
            ],
          },
        ],
      });

      totalIn += res.usage?.input_tokens ?? 0;
      totalOut += res.usage?.output_tokens ?? 0;

      const textBlock = res.content.find((b) => b.type === 'text') as { type: 'text'; text: string } | undefined;
      const text = textBlock?.text ?? '';
      let parsed: {
        any_below_7?: boolean;
        critique?: string;
        fix_prompt?: string;
        mobile?: Record<string, unknown>;
        desktop?: Record<string, unknown>;
      } = {};
      try {
        const raw = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        parsed = JSON.parse(raw) as typeof parsed;
      } catch {
        parsed = { any_below_7: true, critique: text, fix_prompt: 'Parse model JSON and fix UI per critique.' };
      }

      const scoresJson = JSON.stringify({ mobile: parsed.mobile, desktop: parsed.desktop });
      const below = parsed.any_below_7 === true;

      items.push({
        page_path: pagePath,
        viewport_label: '375+1280',
        scores_json: scoresJson,
        critique: String(parsed.critique ?? text).slice(0, 12000),
        fix_prompt: String(parsed.fix_prompt ?? '').slice(0, 12000),
        below_seven: below,
      });
    }
  } finally {
    await browser.close();
  }

  const ingestRes = await fetch(`${BASE}/api/cron/agent-ui-ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cronSecret}`,
    },
    body: JSON.stringify({
      items,
      llm_usage: {
        model: paidCritique ? 'claude-sonnet-4-20250514' : 'none',
        input_tokens: totalIn,
        output_tokens: totalOut,
      },
    }),
  });

  const ingestJson = await ingestRes.json().catch(() => ({}));
  console.log('[ui-critic] ingest status', ingestRes.status, JSON.stringify(ingestJson));
  if (!ingestRes.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
