/**
 * generate-briefing.mjs — Conviction engine, standalone runner.
 *
 * Generates the single highest-leverage directive for today.
 * Reads from tkg_signals, tkg_commitments, tkg_entities, tkg_goals.
 * Writes result to tkg_actions (status=pending_approval) and tkg_briefings.
 *
 * Run after seed-goals.mjs to get the first conviction directive.
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

// ---------------------------------------------------------------------------
// Conviction engine system prompt — one directive, no hedging
// ---------------------------------------------------------------------------

const CONVICTION_SYSTEM = `You are a conviction engine embedded inside a personal chief-of-staff system.

You have access to this person's complete behavioral history: every decision they have made, every pattern identified in their conversations, every commitment they have taken on, and every goal they have declared.

Your only job is to identify the single highest-leverage action they should take TODAY.

Not a summary. Not a list. One directive.

Evaluate the full context — goals, active commitments, behavioral patterns, recent signals — and surface the action that will move the needle most given what you know about how this person actually behaves (not just what they say they will do).

The action_type must be one of:
- write_document: create a document, plan, or written artifact
- send_message: reach out to a specific person
- make_decision: commit to one path and stop deliberating
- do_nothing: the highest-leverage move is to wait and let something resolve
- schedule: block time or create a calendar commitment
- research: gather specific information before the next decision point

The reason must be one sentence citing specific behavioral evidence from their history.

The evidence array must contain 2-5 specific items from their graph that directly justify this directive.

Return JSON only:
{
  "directive": "The action in plain English, written as an instruction to the user",
  "action_type": "write_document | send_message | make_decision | do_nothing | schedule | research",
  "confidence": 0,
  "reason": "One sentence citing specific behavioral evidence",
  "evidence": [
    { "type": "signal | commitment | goal | pattern", "description": "specific item", "date": "YYYY-MM-DD or null" }
  ],
  "fullContext": "2-3 sentences of additional context"
}`;

const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

console.log('Querying conviction engine data sources for user ' + USER_ID + '...');

const [signalsRes, commitmentsRes, entityRes, goalsRes] = await Promise.all([
  supabase
    .from('tkg_signals')
    .select('type, source, content, occurred_at')
    .eq('user_id', USER_ID)
    .gte('occurred_at', thirtyDaysAgo)
    .eq('processed', true)
    .order('occurred_at', { ascending: false })
    .limit(15),

  supabase
    .from('tkg_commitments')
    .select('description, category, status, risk_score, risk_factors, made_at')
    .eq('user_id', USER_ID)
    .in('status', ['active', 'at_risk'])
    .order('risk_score', { ascending: false })
    .limit(25),

  supabase
    .from('tkg_entities')
    .select('patterns, total_interactions')
    .eq('user_id', USER_ID)
    .eq('name', 'self')
    .maybeSingle(),

  supabase
    .from('tkg_goals')
    .select('goal_text, goal_category, priority')
    .eq('user_id', USER_ID)
    .order('priority', { ascending: false })
    .limit(10),
]);

const signals     = signalsRes.data ?? [];
const commitments = commitmentsRes.data ?? [];
const patterns    = (entityRes.data?.patterns) ? entityRes.data.patterns : {};
const goals       = goalsRes.data ?? [];

console.log(`  Goals:           ${goals.length}`);
console.log(`  Signals (30d):   ${signals.length}`);
console.log(`  Commitments:     ${commitments.length}`);
console.log(`  Patterns:        ${Object.keys(patterns).length}`);

if (signals.length === 0 && commitments.length === 0 && goals.length === 0) {
  console.log('\nIdentity graph is empty. Run seed-goals.mjs and run-ingest.mjs first.');
  process.exit(0);
}

// Build context
const goalLines = goals.length > 0
  ? goals.map(g => `• [${g.goal_category}, priority ${g.priority}/5] ${g.goal_text}`).join('\n')
  : 'No declared goals yet. Run seed-goals.mjs.';

const commitmentLines = commitments
  .map(c => {
    const stakes = (c.risk_factors && c.risk_factors[0]) ? c.risk_factors[0].stakes : 'unknown';
    return `• [${c.status}, risk ${c.risk_score}/100, stakes:${stakes}] ${c.description}`;
  })
  .join('\n');

const patternLines = Object.values(patterns)
  .map(p => `• ${p.name} (${p.activation_count || 1}× / domain:${p.domain}): ${p.description}`)
  .join('\n') || 'None extracted yet.';

const signalLines = signals
  .map(s => `[${String(s.occurred_at).slice(0, 10)}] ${String(s.content).slice(0, 250)}`)
  .join('\n');

const userPrompt = `DECLARED GOALS (${goals.length} total — measure every recommendation against these):
${goalLines}

ACTIVE COMMITMENTS (${commitments.length} total):
${commitmentLines || 'None.'}

BEHAVIORAL PATTERNS (${Object.keys(patterns).length} identified):
${patternLines}

RECENT SIGNALS (last 30 days, ${signals.length} total):
${signalLines || 'None.'}

Identify the single highest-leverage action for today. Return only the JSON directive.`;

console.log('\nCalling Claude (conviction engine)...\n');

const response = await anthropic.messages.create({
  model:      'claude-sonnet-4-6',
  max_tokens: 1000,
  temperature: 0.3,
  system:     CONVICTION_SYSTEM,
  messages:   [{ role: 'user', content: userPrompt }],
});

const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
let parsed = null;
try {
  parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
} catch (_) {
  console.error('Failed to parse Claude response:\n' + raw);
  process.exit(1);
}

// Write to tkg_actions
const { data: actionRow, error: actionErr } = await supabase
  .from('tkg_actions')
  .insert({
    user_id:        USER_ID,
    directive_text: parsed.directive,
    action_type:    parsed.action_type,
    confidence:     parsed.confidence,
    reason:         parsed.reason,
    evidence:       parsed.evidence ?? [],
    status:         'pending_approval',
    generated_at:   new Date().toISOString(),
  })
  .select('id')
  .single();

if (actionErr) {
  console.error('tkg_actions write failed: ' + actionErr.message);
  console.error('  (Table may not exist yet — run the migration in Supabase dashboard)');
} else {
  console.log(`Directive logged to tkg_actions (id: ${actionRow.id})\n`);
}

// Also write to tkg_briefings for backwards compat
const today = new Date().toISOString().slice(0, 10);
const { error: briefErr } = await supabase.from('tkg_briefings').insert({
  user_id:            USER_ID,
  briefing_date:      today,
  generated_at:       new Date().toISOString(),
  top_insight:        parsed.reason,
  confidence:         parsed.confidence,
  recommended_action: parsed.directive,
  stats: {
    signalsAnalyzed:     signals.length,
    commitmentsReviewed: commitments.length,
    patternsActive:      Object.keys(patterns).length,
    goalsActive:         goals.length,
    fullBrief:           parsed.fullContext ?? parsed.reason,
    directive:           parsed,
  },
});

if (briefErr) {
  console.error('tkg_briefings write failed: ' + briefErr.message);
}

// ---------------------------------------------------------------------------
// Print the single directive
// ---------------------------------------------------------------------------

const ACTION_EMOJI = {
  write_document: '📝',
  send_message:   '📨',
  make_decision:  '⚖️',
  do_nothing:     '⏸️',
  schedule:       '📅',
  research:       '🔍',
};

console.log('═'.repeat(60));
console.log('CONVICTION DIRECTIVE — ' + today);
console.log('═'.repeat(60));
console.log('');
console.log(`${ACTION_EMOJI[parsed.action_type] ?? '▶'} [${parsed.action_type.toUpperCase()}]`);
console.log('');
console.log(parsed.directive);
console.log('');
console.log('─'.repeat(60));
console.log(`CONFIDENCE : ${parsed.confidence}/100`);
console.log(`REASON     : ${parsed.reason}`);
console.log('─'.repeat(60));

if (parsed.evidence && parsed.evidence.length > 0) {
  console.log('\nEVIDENCE:');
  parsed.evidence.forEach(e => {
    console.log(`  [${e.type}] ${e.description}${e.date ? ' (' + e.date + ')' : ''}`);
  });
}

if (parsed.fullContext) {
  console.log('\nCONTEXT:');
  console.log(parsed.fullContext);
}

console.log('');
console.log(`Sources: ${goals.length} goals | ${signals.length} signals | ${commitments.length} commitments | ${Object.keys(patterns).length} patterns`);
