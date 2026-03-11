#!/usr/bin/env node
/**
 * ingest-json-export.mjs
 *
 * Reads Claude's conversations.json export, converts each conversation to
 * plain text, and posts to /api/ingest/conversation.
 *
 * Usage:
 *   CRON_SECRET=<secret> node scripts/ingest-json-export.mjs <path/to/conversations.json>
 *
 * Env vars:
 *   CRON_SECRET   — bearer token (required)
 *   INGEST_URL    — base URL (default: https://foldera.ai)
 *   DELAY_MS      — ms between requests (default: 800)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';

const jsonPath  = resolve(process.argv[2] ?? './conversations.json');
const baseUrl   = (process.env.INGEST_URL ?? 'https://foldera.ai').replace(/\/$/, '');
const endpoint  = `${baseUrl}/api/ingest/conversation`;
const secret    = process.env.CRON_SECRET;
const delayMs   = parseInt(process.env.DELAY_MS ?? '800', 10);
const manifestPath = jsonPath.replace(/\.json$/, '.ingested.json');

if (!secret) {
  console.error('[ingest-json] CRON_SECRET env var is required');
  process.exit(1);
}

if (!existsSync(jsonPath)) {
  console.error(`[ingest-json] File not found: ${jsonPath}`);
  process.exit(1);
}

function loadManifest() {
  if (!existsSync(manifestPath)) return {};
  try { return JSON.parse(readFileSync(manifestPath, 'utf8')); }
  catch { return {}; }
}

function saveManifest(m) {
  writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/** Convert a Claude export conversation object to a readable transcript. */
function conversationToText(conv) {
  const lines = [];
  lines.push(`# ${conv.name || 'Untitled conversation'}`);
  lines.push(`Date: ${conv.created_at ?? ''}`);
  lines.push('');

  const messages = Array.isArray(conv.chat_messages) ? conv.chat_messages : [];
  // Sort by created_at ascending
  messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  for (const msg of messages) {
    const role = msg.sender === 'human' ? 'Human' : 'Assistant';
    // text is the plaintext version; fall back to content array
    let text = msg.text ?? '';
    if (!text && Array.isArray(msg.content)) {
      text = msg.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');
    }
    if (text.trim()) {
      lines.push(`${role}: ${text.trim()}`);
      lines.push('');
    }
  }

  return lines.join('\n').trim();
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

async function main() {
  console.log(`[ingest-json] Loading ${jsonPath} …`);
  const conversations = JSON.parse(readFileSync(jsonPath, 'utf8'));

  if (!Array.isArray(conversations)) {
    console.error('[ingest-json] Expected an array at top level');
    process.exit(1);
  }

  console.log(`[ingest-json] ${conversations.length} conversations found`);
  console.log(`[ingest-json] Endpoint: ${endpoint}`);

  const manifest = loadManifest();
  const newConvs = conversations.filter(c => !manifest[c.uuid]);

  console.log(`[ingest-json] Already ingested: ${conversations.length - newConvs.length} | New: ${newConvs.length}`);
  console.log('');

  if (newConvs.length === 0) {
    console.log('[ingest-json] Nothing new to ingest. Done.');
    return;
  }

  let succeeded = 0;
  let skipped   = 0;
  let failed    = 0;
  let totalSignals    = 0;
  let totalDecisions  = 0;
  let totalPatterns   = 0;
  let totalTokens     = 0;

  for (let i = 0; i < newConvs.length; i++) {
    const conv   = newConvs[i];
    const prefix = `[${i + 1}/${newConvs.length}] ${conv.name?.slice(0, 60) ?? conv.uuid}`;

    const text = conversationToText(conv);

    if (text.length < 50) {
      console.log(`${prefix} — too short (${text.length} chars), skipping`);
      manifest[conv.uuid] = { skipped: true, reason: 'too_short', at: new Date().toISOString() };
      saveManifest(manifest);
      skipped++;
      continue;
    }

    try {
      const result = await postConversation(text);

      if (result.signalId === null && result.decisionsWritten === 0 && result.patternsUpdated === 0) {
        console.log(`${prefix} — duplicate`);
        manifest[conv.uuid] = { duplicate: true, at: new Date().toISOString() };
      } else {
        console.log(
          `${prefix} — ok | decisions=${result.decisionsWritten}, patterns=${result.patternsUpdated}, tokens=${result.tokensUsed ?? 0}`
        );
        totalSignals   += result.signalId ? 1 : 0;
        totalDecisions += result.decisionsWritten ?? 0;
        totalPatterns  += result.patternsUpdated  ?? 0;
        totalTokens    += result.tokensUsed       ?? 0;
        manifest[conv.uuid] = {
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
      failed++;
    }

    if (i < newConvs.length - 1) await sleep(delayMs);
  }

  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('[ingest-json] Summary');
  console.log(`  Succeeded : ${succeeded}`);
  console.log(`  Skipped   : ${skipped}`);
  console.log(`  Failed    : ${failed}`);
  console.log(`  Signals   : +${totalSignals}`);
  console.log(`  Decisions : +${totalDecisions}`);
  console.log(`  Patterns  : +${totalPatterns}`);
  console.log(`  Tokens    : ~${totalTokens.toLocaleString()}`);
  console.log('═══════════════════════════════════════════');

  if (failed > 0) {
    console.log('[ingest-json] Failed items will retry on next run.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[ingest-json] Fatal:', err);
  process.exit(1);
});
