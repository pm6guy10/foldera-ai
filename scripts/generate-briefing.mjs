/**
 * generate-briefing.mjs — direct briefing generation, no HTTP server needed.
 * Mirrors the logic in lib/briefing/generator.ts.
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

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

const REQUIRED = ['ANTHROPIC_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'INGEST_USER_ID'];
for (const k of REQUIRED) {
  if (!process.env[k]) { console.error('Missing env: ' + k); process.exit(1); }
}

const USER_ID = process.env.INGEST_USER_ID;

const { default: Anthropic } = await import('@anthropic-ai/sdk');
const { createClient }       = await import('@supabase/supabase-js');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase  = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const COS_SYSTEM = `You are a chief of staff who has been embedded with this person for months. You have read everything. You know their patterns, their goals, their decisions, what has worked and what hasn't.

Your job is to walk in the room and tell them exactly what they need to know today — without being asked.

Write a morning brief: 3-5 lines maximum. Lead with the single most important thing. Include a confidence score (0-100) on your primary recommendation, based on how many times similar decisions have produced similar outcomes in their history. End with one specific action.

Do not hedge. Do not list options. Give a verdict.

Return JSON only:
{
  "topInsight": "The single most important thing right now",
  "confidence": 0,
  "recommendedAction": "One specific action to take today",
  "fullBrief": "Full 3-5 line morning brief prose"
}`;

const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

console.log('Querying identity graph for user ' + USER_ID + '...');

const [signalsRes, commitmentsRes, entityRes] = await Promise.all([
  supabase
    .from('tkg_signals')
    .select('type, source, content, occurred_at')
    .eq('user_id', USER_ID)
    .gte('occurred_at', thirtyDaysAgo)
    .order('occurred_at', { ascending: false })
    .limit(20),

  supabase
    .from('tkg_commitments')
    .select('description, category, status, risk_score, risk_factors, made_at')
    .eq('user_id', USER_ID)
    .in('status', ['active', 'at_risk'])
    .order('risk_score', { ascending: false })
    .limit(30),

  supabase
    .from('tkg_entities')
    .select('patterns, total_interactions')
    .eq('user_id', USER_ID)
    .eq('name', 'self')
    .maybeSingle(),
]);

const signals     = signalsRes.data ?? [];
const commitments = commitmentsRes.data ?? [];
const patterns    = (entityRes.data && entityRes.data.patterns) ? entityRes.data.patterns : {};

console.log('  Signals (last 30d): ' + signals.length);
console.log('  Active commitments: ' + commitments.length);
console.log('  Patterns: ' + Object.keys(patterns).length);

if (signals.length === 0 && commitments.length === 0) {
  console.log('\nIdentity graph is empty — nothing to brief on.');
  process.exit(0);
}

// Build context string
const signalLines = signals
  .map(function(s) {
    return '[' + s.source + '] ' + String(s.occurred_at).slice(0, 10) + ': ' + String(s.content).slice(0, 300);
  })
  .join('\n');

const commitmentLines = commitments
  .map(function(c) {
    const stakes = (c.risk_factors && c.risk_factors[0]) ? c.risk_factors[0].stakes : 'unknown';
    return '• ' + c.description + ' [' + c.status + ', stakes: ' + stakes + ']';
  })
  .join('\n');

const patternLines = Object.values(patterns)
  .map(function(p) {
    return '• ' + p.name + ': ' + p.description + ' (seen ' + (p.activation_count || 1) + '×)';
  })
  .join('\n') || 'None extracted yet.';

const userPrompt = `RECENT SIGNALS (last 30 days, ${signals.length} total):
${signalLines || 'None.'}

ACTIVE COMMITMENTS (${commitments.length} total):
${commitmentLines || 'None.'}

BEHAVIORAL PATTERNS:
${patternLines}

Write the morning brief.`;

console.log('\nCalling Claude (chief-of-staff prompt)...\n');

const response = await anthropic.messages.create({
  model:      'claude-sonnet-4-6',
  max_tokens: 500,
  system:     COS_SYSTEM,
  messages:   [{ role: 'user', content: userPrompt }],
});

const raw = response.content[0] && response.content[0].type === 'text' ? response.content[0].text : '';
let parsed = null;
try { parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim()); } catch (_) {}

if (!parsed) {
  console.error('Failed to parse Claude response:\n' + raw);
  process.exit(1);
}

// Write to tkg_briefings
const today = new Date().toISOString().slice(0, 10);
const { error: writeErr } = await supabase.from('tkg_briefings').insert({
  user_id:          USER_ID,
  briefing_date:    today,
  generated_at:     new Date().toISOString(),
  top_insight:      parsed.topInsight,
  confidence:       parsed.confidence,
  recommended_action: parsed.recommendedAction,
  stats: {
    signalsAnalyzed:    signals.length,
    commitmentsReviewed: commitments.length,
    patternsActive:     Object.keys(patterns).length,
    fullBrief:          parsed.fullBrief,
  },
});

if (writeErr) {
  console.error('tkg_briefings write failed: ' + writeErr.message);
} else {
  console.log('Brief written to tkg_briefings.\n');
}

// Print the brief
console.log('═'.repeat(60));
console.log('MORNING BRIEF — ' + today);
console.log('═'.repeat(60));
console.log('\n' + parsed.fullBrief);
console.log('\n─'.repeat(60));
console.log('TOP INSIGHT : ' + parsed.topInsight);
console.log('CONFIDENCE  : ' + parsed.confidence + '/100');
console.log('ACTION      : ' + parsed.recommendedAction);
console.log('─'.repeat(60));
console.log('\nStats: ' + signals.length + ' signals | ' + commitments.length + ' commitments | ' + Object.keys(patterns).length + ' patterns');
