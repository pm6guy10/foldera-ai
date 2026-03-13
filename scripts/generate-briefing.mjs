/**
 * generate-briefing.mjs — Conviction engine + feedback learning, standalone runner.
 *
 * Generates the single highest-leverage directive for today.
 * Reads:  tkg_signals, tkg_commitments, tkg_entities, tkg_goals, tkg_actions (feedback)
 * Writes: tkg_actions (status=pending_approval), tkg_briefings
 *
 * Feedback learning:
 *   - Queries all tkg_actions rows where feedback_weight IS NOT NULL
 *   - Injects penalize/boost section into Claude prompt
 *   - Prints before/after comparison so you can see whether learning shifted the directive
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
    let val = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes (single or double)
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
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
// Chief-of-Staff system prompt — v2 brain
// ---------------------------------------------------------------------------

const CONVICTION_SYSTEM = `You are a chief of staff who knows everything about this person. You have their goals, behavioral patterns, commitments, approval/skip history, and current signals.

Your job is NOT to summarize. Your job is to find the ONE thing they should do today that they haven't thought of yet.

Rules:
- NEVER repeat a directive the user already approved. If they approved "wait on MAS3" yesterday, find the next thing.
- NEVER produce a directive the user obviously knows. "Be present with family" is a greeting card, not insight.
- Every directive MUST include a concrete artifact: drafted email, specific task with deadline, document to review, decision with two options. No artifact = not a directive.
- Confidence score reflects SPECIFICITY not CERTAINTY. Vague but true = 30%. Specific with evidence = 85%+.
- Scan ALL data sources not just the loudest signal. Check: approaching deadlines, unanswered threads, commitments not acted on, patterns predicting failure, calendar gaps, financial triggers, relationship maintenance.
- Before outputting, test: "Would a $200/hr chief of staff say this or be embarrassed?" If embarrassed, go deeper.
- When the strategic answer is "do nothing today," surface a DIFFERENT domain. Career quiet? Surface family, financial, health, or project task. Never go dark because one thread paused.

Output JSON only — no prose outside the JSON:
{
  "directive": "one sentence imperative",
  "artifact_type": "drafted_email | document | decision | calendar_event | research_brief | wait_rationale",
  "artifact": <the actual finished work product as a JSON object — for drafted_email: {"to":"...","subject":"...","body":"..."}, for document: {"title":"...","content":"..."}, for calendar_event: {"title":"...","start":"ISO8601","end":"ISO8601","description":"..."}, for research_brief: {"findings":"...","sources":[],"recommended_action":"..."}, for decision: {"options":[{"option":"...","weight":0.0,"rationale":"..."}],"recommendation":"..."}, for wait_rationale: {"context":"...","evidence":"..."}>,
  "confidence": 0,
  "evidence": "one sentence citing specific data",
  "domain": "career | family | financial | health | project",
  "why_now": "one sentence why today"
}`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFeedbackSection(rows) {
  if (!rows || rows.length === 0) return '';

  const positive = rows.filter(r => (r.feedback_weight ?? 0) > 0);
  const negative = rows.filter(r => (r.feedback_weight ?? 0) < 0);

  const netByType = {};
  for (const r of rows) {
    netByType[r.action_type] = (netByType[r.action_type] ?? 0) + (r.feedback_weight ?? 0);
  }

  const netLines = Object.entries(netByType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, weight]) => `  • ${type}: ${weight > 0 ? '+' : ''}${weight.toFixed(1)}`)
    .join('\n');

  const positiveLines = positive
    .slice(0, 5)
    .map(r => `  • [${r.action_type}] "${r.directive_text.slice(0, 120)}" — ${r.reason.slice(0, 100)} (weight: +${r.feedback_weight})`)
    .join('\n');

  const negativeLines = negative
    .slice(0, 5)
    .map(r => `  • [${r.action_type}] "${r.directive_text.slice(0, 120)}" — ${r.reason.slice(0, 100)} (weight: ${r.feedback_weight})`)
    .join('\n');

  return `
FEEDBACK HISTORY (${rows.length} prior directives with user feedback — penalize negatives, boost positives):

NET WEIGHT BY ACTION_TYPE:
${netLines}
${positive.length > 0 ? '\nEXECUTED (positive — user approved and ran):\n' + positiveLines : ''}
${negative.length > 0 ? '\nSKIPPED/REJECTED (negative — avoid similar patterns):\n' + negativeLines : ''}`;
}

// ---------------------------------------------------------------------------
// Load all data sources
// ---------------------------------------------------------------------------

const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

console.log('Querying conviction engine data sources for user ' + USER_ID + '...');

const [signalsRes, commitmentsRes, entityRes, goalsRes, feedbackRes, prevDirectiveRes] = await Promise.all([
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

  // Feedback rows — all evaluated directives (column may not exist yet)
  supabase
    .from('tkg_actions')
    .select('id, action_type, directive_text, reason, status, feedback_weight, generated_at')
    .eq('user_id', USER_ID)
    .not('feedback_weight', 'is', null)
    .order('generated_at', { ascending: false })
    .limit(30)
    .then(r => r), // catch column-missing error below

  // Previous directive — for before/after comparison
  supabase
    .from('tkg_actions')
    .select('id, action_type, directive_text, confidence, status, generated_at')
    .eq('user_id', USER_ID)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle(),
]);

const signals     = signalsRes.data ?? [];
const commitments = commitmentsRes.data ?? [];
const patterns    = entityRes.data?.patterns ? entityRes.data.patterns : {};
const goals       = goalsRes.data ?? [];
const prevDirective = prevDirectiveRes.data ?? null;

// feedback_weight column may not exist yet in the DB — degrade gracefully
let feedback = [];
let feedbackColMissing = false;
if (feedbackRes.error && feedbackRes.error.code === '42703') {
  feedbackColMissing = true;
} else {
  feedback = feedbackRes.data ?? [];
}

console.log(`  Goals:           ${goals.length}`);
console.log(`  Signals (30d):   ${signals.length}`);
console.log(`  Commitments:     ${commitments.length}`);
console.log(`  Patterns:        ${Object.keys(patterns).length}`);
console.log(`  Feedback rows:   ${feedback.length} (${feedback.filter(r => r.feedback_weight > 0).length} positive, ${feedback.filter(r => r.feedback_weight < 0).length} negative)`);

// ---------------------------------------------------------------------------
// Print feedback summary
// ---------------------------------------------------------------------------

console.log('\n' + '═'.repeat(60));
console.log('FEEDBACK HISTORY');
console.log('═'.repeat(60));

if (feedbackColMissing) {
  console.log('  ⚠  feedback_weight column not yet in DB.');
  console.log('  Run this SQL in Supabase Dashboard → SQL Editor to activate learning:');
  console.log('');
  console.log('    ALTER TABLE tkg_actions');
  console.log('      ADD COLUMN IF NOT EXISTS feedback_weight FLOAT DEFAULT NULL;');
  console.log('');
  console.log('  After running the SQL, approve or skip a directive from the dashboard,');
  console.log('  then re-run this script to see learning in action.');
} else if (feedback.length === 0) {
  console.log('  No evaluated directives yet (no approvals or skips recorded).');
  console.log('  Approve or skip a directive from the dashboard, then re-run this script.');
} else {
  const netByType = {};
  for (const r of feedback) {
    netByType[r.action_type] = (netByType[r.action_type] ?? 0) + r.feedback_weight;
  }
  console.log('  Net weight by action_type:');
  for (const [type, weight] of Object.entries(netByType).sort((a, b) => b[1] - a[1])) {
    const bar = weight > 0
      ? '+'.repeat(Math.min(10, Math.round(weight * 5)))
      : '-'.repeat(Math.min(10, Math.round(Math.abs(weight) * 5)));
    console.log(`    ${type.padEnd(16)} ${(weight > 0 ? '+' : '') + weight.toFixed(1)}  ${bar}`);
  }
  console.log('');
  console.log('  Recent evaluated directives:');
  for (const r of feedback.slice(0, 5)) {
    const label = r.feedback_weight > 0 ? '✓ EXECUTED' : (r.status === 'rejected' ? '✗ REJECTED' : '⊘ SKIPPED');
    console.log(`    [${label}] [${r.action_type}] ${r.directive_text.slice(0, 80)}...`);
  }
}

// ---------------------------------------------------------------------------
// Previous directive
// ---------------------------------------------------------------------------

console.log('\n' + '─'.repeat(60));
console.log('PREVIOUS DIRECTIVE (before this run):');
if (prevDirective) {
  const prevStatus = prevDirective.status ?? 'unknown';
  console.log(`  Action type: ${prevDirective.action_type.toUpperCase()}`);
  console.log(`  Confidence:  ${prevDirective.confidence}/100`);
  console.log(`  Status:      ${prevStatus}`);
  console.log(`  Text:        ${String(prevDirective.directive_text).slice(0, 100)}...`);
  console.log(`  Generated:   ${String(prevDirective.generated_at).slice(0, 10)}`);
} else {
  console.log('  No prior directive found.');
}

// ---------------------------------------------------------------------------
// Build prompt
// ---------------------------------------------------------------------------

if (signals.length === 0 && commitments.length === 0 && goals.length === 0) {
  console.log('\nIdentity graph is empty. Run seed-goals.mjs and run-ingest.mjs first.');
  process.exit(0);
}

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

const feedbackSection = buildFeedbackSection(feedback);

const userPrompt = `DECLARED GOALS (${goals.length} total — measure every recommendation against these):
${goalLines}

ACTIVE COMMITMENTS (${commitments.length} total):
${commitmentLines || 'None.'}

BEHAVIORAL PATTERNS (${Object.keys(patterns).length} identified):
${patternLines}

RECENT SIGNALS (last 30 days, ${signals.length} total):
${signalLines || 'None.'}
${feedbackSection}
Identify the single highest-leverage action for today. Return only the JSON directive.`;

console.log('\n' + '─'.repeat(60));
console.log('Calling Claude (conviction engine + feedback)...\n');

// ---------------------------------------------------------------------------
// Claude call
// ---------------------------------------------------------------------------

const response = await anthropic.messages.create({
  model:      'claude-sonnet-4-20250514',
  max_tokens: 2000,
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

// ---------------------------------------------------------------------------
// Write to tkg_actions
// ---------------------------------------------------------------------------

// Map artifact_type → action_type for storage
const ARTIFACT_TO_ACTION = {
  drafted_email:   'send_message',
  document:        'write_document',
  decision:        'make_decision',
  calendar_event:  'schedule',
  research_brief:  'research',
  wait_rationale:  'do_nothing',
};
const actionType = parsed.action_type ?? ARTIFACT_TO_ACTION[parsed.artifact_type] ?? 'research';
const evidenceArr = typeof parsed.evidence === 'string'
  ? [{ type: 'signal', description: parsed.evidence, date: null }]
  : (parsed.evidence ?? []);

const { data: actionRow, error: actionErr } = await supabase
  .from('tkg_actions')
  .insert({
    user_id:        USER_ID,
    directive_text: parsed.directive,
    action_type:    actionType,
    confidence:     parsed.confidence,
    reason:         parsed.why_now ?? parsed.reason ?? parsed.evidence ?? '',
    evidence:       evidenceArr,
    status:         'pending_approval',
    generated_at:   new Date().toISOString(),
    execution_result: parsed.artifact ? { artifact: parsed.artifact } : null,
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
await supabase.from('tkg_briefings').insert({
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
    feedbackSignals:     feedback.length,
    fullBrief:           parsed.fullContext ?? parsed.reason,
    directive:           parsed,
  },
});

// ---------------------------------------------------------------------------
// Print the directive
// ---------------------------------------------------------------------------

const ACTION_EMOJI = {
  write_document: '📝',
  send_message:   '📨',
  make_decision:  '⚖️',
  do_nothing:     '⏸️',
  schedule:       '📅',
  research:       '🔍',
};

// Support both old action_type and new artifact_type
const displayType = parsed.artifact_type ?? parsed.action_type ?? 'unknown';

console.log('═'.repeat(60));
console.log('CONVICTION DIRECTIVE — ' + today);
console.log('═'.repeat(60));
console.log('');
console.log(`${ACTION_EMOJI[displayType] ?? ACTION_EMOJI[parsed.action_type] ?? '▶'} [${displayType.toUpperCase()}]`);
if (parsed.domain) console.log(`DOMAIN     : ${parsed.domain}`);
console.log('');
console.log(parsed.directive);
console.log('');
console.log('─'.repeat(60));
console.log(`CONFIDENCE : ${parsed.confidence}/100`);
console.log(`EVIDENCE   : ${typeof parsed.evidence === 'string' ? parsed.evidence : JSON.stringify(parsed.evidence)}`);
if (parsed.why_now) console.log(`WHY NOW    : ${parsed.why_now}`);
if (parsed.reason)  console.log(`REASON     : ${parsed.reason}`);
console.log('─'.repeat(60));

if (parsed.artifact) {
  console.log('\nARTIFACT:');
  if (typeof parsed.artifact === 'object') {
    console.log(JSON.stringify(parsed.artifact, null, 2));
  } else {
    console.log(parsed.artifact);
  }
}

if (parsed.fullContext) {
  console.log('\nCONTEXT:');
  console.log(parsed.fullContext);
}

// ---------------------------------------------------------------------------
// Before / after delta
// ---------------------------------------------------------------------------

console.log('\n' + '═'.repeat(60));
console.log('DELTA — did feedback learning change the directive?');
console.log('═'.repeat(60));

if (!prevDirective) {
  console.log('  No prior directive to compare against. This is the first run.');
} else {
  const prevType    = prevDirective.action_type;
  const prevConf    = prevDirective.confidence;
  const newType     = parsed.artifact_type ?? parsed.action_type ?? 'unknown';
  const newConf     = parsed.confidence;
  const typeChanged = prevType !== newType;
  const confDelta   = newConf - prevConf;

  console.log(`  Previous: [${prevType.toUpperCase()}] at ${prevConf}% confidence`);
  console.log(`  New:      [${newType.toUpperCase()}] at ${newConf}% confidence`);
  console.log('');

  if (typeChanged) {
    console.log(`  ✓ ACTION TYPE CHANGED: ${prevType} → ${newType}`);
  } else {
    console.log(`  — Action type unchanged: ${newType}`);
  }

  if (Math.abs(confDelta) >= 3) {
    const direction = confDelta > 0 ? '▲' : '▼';
    console.log(`  ${direction} Confidence shifted ${confDelta > 0 ? '+' : ''}${confDelta} points`);
  } else {
    console.log(`  — Confidence within ±3 points (${confDelta > 0 ? '+' : ''}${confDelta})`);
  }

  if (feedback.length === 0) {
    console.log('');
    console.log('  Note: No feedback history yet — scores reflect behavioral data only.');
    console.log('  To activate learning: approve or skip a directive from the dashboard,');
    console.log('  then re-run this script. The feedback_weight column will shift future directives.');
  } else {
    const negativeTypes = feedback
      .filter(r => r.feedback_weight < 0)
      .map(r => r.action_type);
    const positiveTypes = feedback
      .filter(r => r.feedback_weight > 0)
      .map(r => r.action_type);

    if (typeChanged && negativeTypes.includes(prevType) && !negativeTypes.includes(newType)) {
      console.log(`  ✓ LEARNING SIGNAL APPLIED: pivoted away from ${prevType} (previously penalized)`);
    }
    if (!typeChanged && negativeTypes.includes(newType)) {
      console.log(`  ⚠  Warning: recommended ${newType} despite negative feedback history. Check reasoning.`);
    }
    if (positiveTypes.includes(newType)) {
      console.log(`  ✓ Boosted: ${newType} has positive feedback history`);
    }
  }
}

console.log('');
console.log(`Sources: ${goals.length} goals | ${signals.length} signals | ${commitments.length} commitments | ${Object.keys(patterns).length} patterns | ${feedback.length} feedback signals`);
