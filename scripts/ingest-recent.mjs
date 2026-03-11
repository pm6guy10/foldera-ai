#!/usr/bin/env node
/**
 * ingest-recent.mjs
 *
 * Reads .txt and .md files from a directory, posts each to /api/ingest/conversation,
 * and tracks which files have been processed in a .ingested.json manifest so re-runs
 * only pick up new files.
 *
 * Usage:
 *   node scripts/ingest-recent.mjs ./conversations/
 *   node scripts/ingest-recent.mjs                   # defaults to ./conversations/
 *
 * Env vars:
 *   CRON_SECRET   — bearer token for /api/ingest/conversation (required)
 *   INGEST_URL    — base URL of the running app (default: http://localhost:3000)
 *   DELAY_MS      — ms to wait between requests (default: 500)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { resolve, join, basename } from 'path';
import { createServer } from 'http';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const dir        = resolve(process.argv[2] ?? './conversations');
const baseUrl    = (process.env.INGEST_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const endpoint   = `${baseUrl}/api/ingest/conversation`;
const secret     = process.env.CRON_SECRET;
const delayMs    = parseInt(process.env.DELAY_MS ?? '500', 10);

const manifestPath = join(dir, '.ingested.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadManifest() {
  if (!existsSync(manifestPath)) return {};
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    console.warn('[ingest-recent] Could not parse .ingested.json — starting fresh');
    return {};
  }
}

function saveManifest(manifest) {
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function postConversation(text) {
  const url = new URL(endpoint);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? (await import('https')) : (await import('http'));

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ text });
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': `Bearer ${secret}`,
      },
    };

    const req = lib.default.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${json.error ?? data}`));
          }
        } catch {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!secret) {
    console.error('[ingest-recent] CRON_SECRET env var is required');
    process.exit(1);
  }

  if (!existsSync(dir)) {
    console.error(`[ingest-recent] Directory not found: ${dir}`);
    process.exit(1);
  }

  const manifest = loadManifest();
  const stat = statSync(dir);
  if (!stat.isDirectory()) {
    console.error(`[ingest-recent] Not a directory: ${dir}`);
    process.exit(1);
  }

  const allFiles = readdirSync(dir)
    .filter(f => f.endsWith('.txt') || f.endsWith('.md'))
    .filter(f => f !== '.ingested.json')
    .sort();

  const newFiles = allFiles.filter(f => !manifest[f]);

  console.log(`[ingest-recent] Directory : ${dir}`);
  console.log(`[ingest-recent] Total files: ${allFiles.length} | Already ingested: ${allFiles.length - newFiles.length} | New: ${newFiles.length}`);
  console.log(`[ingest-recent] Endpoint  : ${endpoint}`);

  if (newFiles.length === 0) {
    console.log('[ingest-recent] Nothing new to ingest. Done.');
    return;
  }

  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < newFiles.length; i++) {
    const filename = newFiles[i];
    const filepath = join(dir, filename);
    const prefix   = `[${i + 1}/${newFiles.length}] ${filename}`;

    let text;
    try {
      text = readFileSync(filepath, 'utf8').trim();
    } catch (err) {
      console.error(`${prefix} — read error: ${err.message}`);
      failed++;
      continue;
    }

    if (text.length < 50) {
      console.log(`${prefix} — too short (${text.length} chars), skipping`);
      manifest[filename] = { skipped: true, reason: 'too_short', at: new Date().toISOString() };
      saveManifest(manifest);
      skipped++;
      continue;
    }

    try {
      const result = await postConversation(text);

      // Duplicate signal (already in graph)
      if (result.signalId === null && result.decisionsWritten === 0 && result.patternsUpdated === 0) {
        console.log(`${prefix} — duplicate (already ingested)`);
        manifest[filename] = { duplicate: true, at: new Date().toISOString() };
      } else {
        console.log(
          `${prefix} — ok | signals+1, decisions=${result.decisionsWritten}, patterns=${result.patternsUpdated}, tokens=${result.tokensUsed}`
        );
        manifest[filename] = {
          signalId: result.signalId,
          decisionsWritten: result.decisionsWritten,
          patternsUpdated: result.patternsUpdated,
          tokensUsed: result.tokensUsed,
          at: new Date().toISOString(),
        };
      }

      saveManifest(manifest);
      succeeded++;
    } catch (err) {
      console.error(`${prefix} — FAILED: ${err.message}`);
      // Don't write to manifest — will retry next run
      failed++;
    }

    if (i < newFiles.length - 1) await sleep(delayMs);
  }

  console.log('');
  console.log(`[ingest-recent] Done. Succeeded: ${succeeded} | Skipped: ${skipped} | Failed: ${failed}`);

  if (failed > 0) {
    console.log('[ingest-recent] Failed files will be retried on the next run.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[ingest-recent] Fatal:', err);
  process.exit(1);
});
