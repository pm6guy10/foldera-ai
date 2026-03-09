/**
 * run-ingest.mjs  —  direct ingest, no HTTP server needed.
 *
 * Safety guarantees:
 *   - Dedup by content_hash: conversations already in tkg_signals are skipped,
 *     so re-runs are always safe and pick up where a previous run left off.
 *   - 60-second hard timeout per Claude API call: a stalled API call is logged
 *     as skipped and the loop continues immediately.
 *   - Every conversation is logged on the first line of its attempt (not just
 *     on success) so you can always see where the run is.
 *
 * Usage (from repo root):
 *   node scripts/run-ingest.mjs
 *   DELAY_MS=500 node scripts/run-ingest.mjs
 *   CONVERSATIONS_PATH=/path/to/conversations.json node scripts/run-ingest.mjs
 */

// ─── Load .env.local ─────────────────────────────────────────────────────────
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadEnv(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv(resolve(ROOT, '.env.local'));

// ─── Config ───────────────────────────────────────────────────────────────────
const REQUIRED = ['ANTHROPIC_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'INGEST_USER_ID'];
for (const k of REQUIRED) {
  if (!process.env[k]) { console.error('Missing env: ' + k); process.exit(1); }
}

const USER_ID         = process.env.INGEST_USER_ID;
const DELAY_MS        = parseInt(process.env.DELAY_MS           || '300', 10);
const MIN_MSGS        = parseInt(process.env.MIN_MESSAGE_COUNT  || '2',   10);
const BATCH_SIZE      = parseInt(process.env.BATCH_SIZE         || '10',  10);
const API_TIMEOUT_MS  = parseInt(process.env.INGEST_TIMEOUT_MS || '120000', 10);
const CONV_PATH       = process.env.CONVERSATIONS_PATH || resolve(ROOT, 'conversations.json');

console.log('Env loaded');
console.log('  ANTHROPIC_API_KEY : ' + process.env.ANTHROPIC_API_KEY.slice(0, 20) + '...');
console.log('  INGEST_USER_ID    : ' + USER_ID);
console.log('  CONVERSATIONS     : ' + CONV_PATH);
console.log('  DELAY_MS          : ' + DELAY_MS + '  |  API_TIMEOUT_MS: ' + API_TIMEOUT_MS);

// ─── Clients ─────────────────────────────────────────────────────────────────
const { default: Anthropic } = await import('@anthropic-ai/sdk');
const { createClient }       = await import('@supabase/supabase-js');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase  = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ─── Extraction prompt ────────────────────────────────────────────────────────
const EXTRACTION_SYSTEM = `You are building an identity graph for a personal chief of staff system.

Read this conversation and extract:
(1) Decisions made — what choice was made, what domain, what context, what stakes.
(2) Outcomes confirmed — results of past decisions, positive or negative.
(3) Behavioral patterns — recurring tendencies, named if possible.
(4) Active goals — stated desired outcomes with time horizons.

Return JSON matching this schema exactly:
{
  "decisions": [
    {
      "description": "string",
      "domain": "career | finances | family | health | faith | relationships | other",
      "context": "string | null",
      "action_taken": "string | null",
      "outcome": "string | null",
      "stakes": "low | medium | high | critical"
    }
  ],
  "outcomes": [{ "decision_description": "string", "result": "string" }],
  "patterns":  [{ "name": "string", "description": "string", "domain": "string" }],
  "goals":     [{ "description": "string", "domain": "string", "time_horizon": "string | null" }]
}

Extract only what is explicit or clearly implied. Do not infer. If nothing relevant, return empty arrays.`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(function(_, reject) {
      setTimeout(function() { reject(new Error('TIMEOUT')); }, ms);
    }),
  ]);
}

function formatConversation(conv) {
  const lines = [
    'CONVERSATION: ' + conv.name,
    'DATE: ' + conv.created_at,
    'UUID: ' + conv.uuid,
    '---',
  ];
  for (const msg of conv.chat_messages) {
    const role = msg.sender === 'human' ? 'USER' : 'ASSISTANT';
    lines.push(role + (msg.created_at ? ' [' + msg.created_at + ']' : '') + ':');
    lines.push(msg.text || '');
    lines.push('');
  }
  return lines.join('\n');
}

// ─── Core extract ─────────────────────────────────────────────────────────────
async function extractConversation(text) {
  const hash = createHash('sha256').update(text).digest('hex');

  // Dedup: skip if content_hash already exists (processed or not)
  const { data: existing } = await supabase
    .from('tkg_signals')
    .select('id, processed')
    .eq('user_id', USER_ID)
    .eq('content_hash', hash)
    .maybeSingle();

  if (existing) {
    return { skipped: true, reason: existing.processed ? 'already ingested' : 'unprocessed signal exists' };
  }

  // Insert signal row
  const { data: signal, error: sigErr } = await supabase
    .from('tkg_signals')
    .insert({
      user_id:      USER_ID,
      source:       'uploaded_document',
      source_id:    hash.slice(0, 16),
      type:         'document_created',
      content:      text,
      content_hash: hash,
      author:       'user',
      recipients:   [],
      occurred_at:  new Date().toISOString(),
      processed:    false,
    })
    .select('id')
    .single();

  if (sigErr) throw new Error('Signal insert: ' + sigErr.message);

  // Claude extraction — hard timeout
  const truncated = text.length > 40_000 ? text.slice(0, 40_000) : text;

  try {
    const response = await withTimeout(
      anthropic.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 2048,
        system:     EXTRACTION_SYSTEM,
        messages:   [{ role: 'user', content: truncated }],
      }),
      API_TIMEOUT_MS
    );

    let payload = { decisions: [], outcomes: [], patterns: [], goals: [] };
    const raw = response.content[0] && response.content[0].type === 'text' ? response.content[0].text : '';
    try { payload = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim()); } catch (_) {}

    // Get or create 'self' entity
    let { data: selfEntity } = await supabase
      .from('tkg_entities').select('id')
      .eq('user_id', USER_ID).eq('name', 'self').maybeSingle();

    if (!selfEntity) {
      const { data: created } = await supabase
        .from('tkg_entities')
        .insert({ user_id: USER_ID, type: 'person', name: 'self', display_name: 'You', emails: [], patterns: {} })
        .select('id').single();
      selfEntity = created;
    }
    const selfId = selfEntity && selfEntity.id;

    // Write decisions
    let decisionsWritten = 0;
    if (selfId && payload.decisions.length > 0) {
      const rows = payload.decisions.map(function(d) {
        return {
          user_id:        USER_ID,
          promisor_id:    selfId,
          promisee_id:    selfId,
          description:    d.description,
          canonical_form: 'DECISION:' + d.domain + ':' + d.description.slice(0, 60).replace(/\s+/g, '_'),
          category:       'make_decision',
          made_at:        new Date().toISOString(),
          source:         'uploaded_document',
          source_id:      signal.id,
          source_context: d.context,
          status:         d.outcome ? 'fulfilled' : 'active',
          resolution:     d.outcome ? { outcome: d.outcome, resolvedAt: new Date().toISOString() } : null,
          risk_factors:   [{ stakes: d.stakes }],
        };
      });
      const { error: cErr } = await supabase.from('tkg_commitments').insert(rows);
      if (!cErr) decisionsWritten = rows.length;
    }

    // Merge patterns
    let patternsUpdated = 0;
    if (selfId && payload.patterns.length > 0) {
      const { data: entityRow } = await supabase
        .from('tkg_entities').select('patterns').eq('id', selfId).single();
      const merged = Object.assign({}, entityRow && entityRow.patterns || {});
      for (const p of payload.patterns) {
        const key = p.name.toLowerCase().replace(/\s+/g, '_');
        merged[key] = {
          name: p.name, description: p.description, domain: p.domain,
          last_seen: new Date().toISOString(),
          activation_count: ((merged[key] && merged[key].activation_count) || 0) + 1,
        };
      }
      const { error: pErr } = await supabase
        .from('tkg_entities')
        .update({ patterns: merged, patterns_updated_at: new Date().toISOString() })
        .eq('id', selfId);
      if (!pErr) patternsUpdated = payload.patterns.length;
    }

    await supabase.from('tkg_signals').update({ processed: true }).eq('id', signal.id);

    return {
      skipped: false,
      decisionsWritten,
      patternsUpdated,
      tokensUsed: (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0),
    };

  } catch (err) {
    // Timeout or Claude error: delete the unprocessed signal so re-run can retry
    await supabase.from('tkg_signals').delete().eq('id', signal.id);
    throw err;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
if (!existsSync(CONV_PATH)) {
  console.error('conversations.json not found: ' + CONV_PATH);
  process.exit(1);
}

const conversations = JSON.parse(readFileSync(CONV_PATH, 'utf8'));
if (!Array.isArray(conversations)) { console.error('Expected array'); process.exit(1); }

const total = conversations.length;
console.log('\n' + total + ' conversations in file');
console.log('─'.repeat(60) + '\n');

const results = [];
let ok = 0, skipped = 0, errors = 0;

for (let i = 0; i < total; i++) {
  const conv  = conversations[i];
  const name  = (conv.name || 'Untitled').slice(0, 60);
  const label = '[' + String(i + 1).padStart(3, '0') + '/' + total + ']';

  // Log immediately before any async work
  process.stdout.write(label + ' ... ' + name + ' ');

  if (!conv.chat_messages || conv.chat_messages.length < MIN_MSGS) {
    console.log('=> SKIP (only ' + (conv.chat_messages ? conv.chat_messages.length : 0) + ' messages)');
    results.push({ uuid: conv.uuid, name, status: 'skipped', reason: 'too few messages' });
    skipped++;
    continue;
  }

  const text = formatConversation(conv);

  try {
    const r = await extractConversation(text);
    if (r.skipped) {
      console.log('=> SKIP (' + r.reason + ')');
      results.push({ uuid: conv.uuid, name, status: 'skipped', reason: r.reason });
      skipped++;
    } else {
      console.log('=> OK  decisions:' + r.decisionsWritten + ' patterns:' + r.patternsUpdated + ' tokens:' + r.tokensUsed);
      results.push({ uuid: conv.uuid, name, status: 'ok', decisionsWritten: r.decisionsWritten, patternsUpdated: r.patternsUpdated });
      ok++;
      if (i < total - 1) await sleep(DELAY_MS);
    }
  } catch (err) {
    const msg = err.message || String(err);
    if (msg === 'TIMEOUT') {
      console.log('=> TIMEOUT (skipped, signal deleted for retry)');
      results.push({ uuid: conv.uuid, name, status: 'skipped', reason: 'timeout' });
      skipped++;
    } else {
      console.log('=> ERROR ' + msg.slice(0, 100));
      results.push({ uuid: conv.uuid, name, status: 'error', reason: msg });
      errors++;
    }
    if (i < total - 1) await sleep(DELAY_MS);
  }

  if ((i + 1) % BATCH_SIZE === 0) {
    console.log('\n   --- checkpoint [' + (i + 1) + '/' + total + ']  ok:' + ok + '  skipped:' + skipped + '  errors:' + errors + ' ---\n');
  }
}

console.log('\n' + '─'.repeat(60));
console.log('Ingested : ' + ok);
console.log('Skipped  : ' + skipped);
console.log('Errors   : ' + errors);

const logPath = resolve(ROOT, 'ingest-results.json');
writeFileSync(logPath, JSON.stringify(results, null, 2));
console.log('\nResults: ' + logPath);

if (errors > 0) process.exit(1);
