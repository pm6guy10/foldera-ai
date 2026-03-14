/**
 * generate-briefing.mjs — Scorer-first conviction engine, standalone runner.
 *
 * Flow:
 *   1. Score all open loops (commitments, signals, relationships) with math
 *   2. Pass ONLY the winning loop + context to Claude
 *   3. Claude writes the artifact — it does NOT choose what to work on
 *
 * Usage: node scripts/generate-briefing.mjs
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

const { default: Anthropic }  = await import('@anthropic-ai/sdk');
const { createClient }        = await import('@supabase/supabase-js');
const { createDecipheriv }    = await import('crypto');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase  = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ---------------------------------------------------------------------------
// Decrypt (AES-256-GCM — matches lib/encryption.ts)
// ---------------------------------------------------------------------------

function decrypt(ciphertext) {
  if (!ciphertext || typeof ciphertext !== 'string') return ciphertext ?? '';
  const key = process.env.ENCRYPTION_KEY;
  if (!key) return ciphertext;
  try {
    const buf     = Buffer.from(ciphertext, 'base64');
    const iv      = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const data    = buf.subarray(28);
    const keyBuf  = Buffer.from(key, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', keyBuf, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
  } catch {
    return ciphertext;
  }
}

// ---------------------------------------------------------------------------
// Scorer — deterministic open-loop ranker (mirrors lib/briefing/scorer.ts)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  'that', 'this', 'with', 'from', 'into', 'through', 'about', 'after',
  'before', 'during', 'between', 'under', 'over', 'have', 'been', 'will',
  'would', 'should', 'could', 'their', 'them', 'they', 'than', 'then',
  'when', 'what', 'which', 'where', 'while', 'also', 'each', 'only',
  'other', 'some', 'such', 'more', 'most', 'very', 'just', 'does',
]);

function goalKeywords(goalText) {
  return goalText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOPWORDS.has(w));
}

function matchGoal(text, goals) {
  const lower = text.toLowerCase();
  let best = null;
  for (const g of goals) {
    const kws = goalKeywords(g.goal_text);
    const matched = kws.filter(kw => lower.includes(kw));
    if (matched.length >= 2 || (matched.length === 1 && kws.length <= 3)) {
      if (!best || g.priority > best.priority) {
        best = { text: g.goal_text, priority: g.priority, category: g.goal_category };
      }
    }
  }
  return best;
}

function deadlineUrgency(dueAt, impliedDueAt) {
  const deadline = dueAt || impliedDueAt;
  if (!deadline) return 0.3;
  const daysUntilDue = (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntilDue < 0) return 1.0;
  return 1 / (1 + Math.exp(3 * (daysUntilDue - 2)));
}

function relationshipUrgency(daysSinceContact) {
  return 1 / (1 + Math.exp(-0.5 * (daysSinceContact - 10)));
}

function signalUrgency(occurredAt) {
  const daysSince = (Date.now() - new Date(occurredAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince <= 1) return 0.9;
  if (daysSince <= 3) return 0.6;
  return 0.3;
}

function inferActionType(text, loopType) {
  if (loopType === 'relationship') return 'send_message';
  const lower = text.toLowerCase();
  if (/\b(email|reply|respond|send|follow.?up|reach out|contact)\b/.test(lower)) return 'send_message';
  if (/\b(decide|decision|choose|option|weigh)\b/.test(lower)) return 'make_decision';
  if (/\b(schedule|calendar|meeting|call|appointment)\b/.test(lower)) return 'schedule';
  if (/\b(research|investigate|look into|find out)\b/.test(lower)) return 'research';
  if (/\b(wait|hold|pause|defer|delay)\b/.test(lower)) return 'do_nothing';
  return 'make_decision';
}

function inferDomain(matchedGoal, text) {
  if (matchedGoal) return matchedGoal.category;
  const lower = text.toLowerCase();
  if (/\b(salary|money|financial|income|runway|payment|budget)\b/.test(lower)) return 'financial';
  if (/\b(job|career|role|application|interview|hire|position)\b/.test(lower)) return 'career';
  if (/\b(family|wife|children|baby|pregnancy|health)\b/.test(lower)) return 'family';
  if (/\b(foldera|build|code|deploy|feature|bug)\b/.test(lower)) return 'project';
  return 'career';
}

async function scoreOpenLoops() {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [commitmentsRes, signalsRes, entitiesRes, goalsRes] = await Promise.all([
    supabase.from('tkg_commitments')
      .select('id, description, category, status, risk_score, due_at, implied_due_at, source_context, updated_at')
      .eq('user_id', USER_ID).in('status', ['active', 'at_risk'])
      .order('risk_score', { ascending: false }).limit(50),
    supabase.from('tkg_signals')
      .select('id, content, source, occurred_at, author, type')
      .eq('user_id', USER_ID).gte('occurred_at', sevenDaysAgo).eq('processed', true)
      .order('occurred_at', { ascending: false }).limit(30),
    supabase.from('tkg_entities')
      .select('id, name, last_interaction, total_interactions, patterns')
      .eq('user_id', USER_ID).neq('name', 'self')
      .lt('last_interaction', fourteenDaysAgo)
      .order('last_interaction', { ascending: true }).limit(10),
    supabase.from('tkg_goals')
      .select('goal_text, priority, goal_category')
      .eq('user_id', USER_ID).gte('priority', 3)
      .order('priority', { ascending: false }).limit(10),
  ]);

  const commitments = commitmentsRes.data ?? [];
  const signals = (signalsRes.data ?? []).map(s => ({ ...s, content: decrypt(s.content ?? '') }));
  const entities = entitiesRes.data ?? [];
  const goals = goalsRes.data ?? [];

  // Fetch all recent signals for context enrichment
  const { data: allRecentSignals } = await supabase.from('tkg_signals')
    .select('content, source, occurred_at').eq('user_id', USER_ID)
    .gte('occurred_at', fourteenDaysAgo).eq('processed', true)
    .order('occurred_at', { ascending: false }).limit(50);
  const decryptedSignals = (allRecentSignals ?? []).map(s => decrypt(s.content ?? ''));

  // Build candidates
  const candidates = [];

  for (const c of commitments) {
    const text = `${c.description}${c.source_context ? ' — ' + c.source_context : ''}`;
    const mg = matchGoal(text, goals);
    candidates.push({
      id: c.id, type: 'commitment', title: c.description, content: text,
      actionType: inferActionType(text, 'commitment'),
      urgency: deadlineUrgency(c.due_at, c.implied_due_at),
      matchedGoal: mg, domain: inferDomain(mg, text),
    });
  }

  for (const s of signals) {
    const text = String(s.content ?? '');
    if (text.length < 20) continue;
    const mg = matchGoal(text, goals);
    candidates.push({
      id: s.id, type: 'signal', title: text.slice(0, 120), content: text,
      actionType: inferActionType(text, 'signal'),
      urgency: signalUrgency(s.occurred_at),
      matchedGoal: mg, domain: inferDomain(mg, text),
    });
  }

  for (const e of entities) {
    const daysSince = Math.floor((Date.now() - new Date(e.last_interaction).getTime()) / (1000 * 60 * 60 * 24));
    const text = `${e.name}: last contact ${daysSince} days ago, ${e.total_interactions} total interactions`;
    const mg = matchGoal(text, goals);
    candidates.push({
      id: e.id, type: 'relationship', title: `Follow up with ${e.name}`, content: text,
      actionType: 'send_message',
      urgency: relationshipUrgency(daysSince),
      matchedGoal: mg, domain: inferDomain(mg, text),
    });
  }

  if (candidates.length === 0) return null;

  // Score and rank
  const scored = [];
  for (const c of candidates) {
    const stakes = c.matchedGoal ? c.matchedGoal.priority : 1.0;

    // Tractability from tkg_pattern_metrics
    let tractability = 0.5;
    try {
      const { data: pm } = await supabase.from('tkg_pattern_metrics')
        .select('total_activations, successful_outcomes')
        .eq('user_id', USER_ID).eq('pattern_hash', `${c.actionType}:${c.domain}`)
        .maybeSingle();
      if (pm) {
        tractability = Math.max(0.1, (pm.successful_outcomes + 1) / (pm.total_activations + 2));
      }
    } catch { /* use default */ }

    const score = stakes * c.urgency * tractability;

    // Related signals by keyword overlap
    const loopWords = new Set(
      c.content.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 5)
    );
    const related = decryptedSignals
      .filter(sig => {
        const sigWords = sig.toLowerCase().split(/\s+/);
        return sigWords.filter(w => loopWords.has(w)).length >= 3;
      })
      .slice(0, 5);

    scored.push({
      id: c.id, type: c.type, title: c.title, content: c.content,
      suggestedActionType: c.actionType,
      matchedGoal: c.matchedGoal, score,
      breakdown: { stakes, urgency: c.urgency, tractability },
      relatedSignals: related,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  // Print top 5
  console.log('\n[scorer] Top 5 candidates:');
  for (const s of scored.slice(0, 5)) {
    console.log(
      `  ${s.score.toFixed(2)} = ${s.breakdown.stakes}S * ${s.breakdown.urgency.toFixed(2)}U * ${s.breakdown.tractability.toFixed(2)}T | [${s.type}] ${s.title.slice(0, 80)}`
    );
  }

  return scored[0] ?? null;
}

// ---------------------------------------------------------------------------
// System prompt — focused
// ---------------------------------------------------------------------------

const FOCUSED_SYSTEM = `You are drafting ONE artifact for ONE specific situation. The situation has already been selected by a scoring algorithm. Your job is to write the artifact using the real names, dates, and details from the data below.

Do not choose what to work on. That decision is already made.

RULES:
- Use REAL names, email addresses, dates, and details from the SIGNAL DATA below. They are there.
- NEVER use placeholders: [Name], [email@example.com], [Company], [Date], TBD, $____. If you cannot find a specific value in the data, use a decision artifact instead.
- The one-tap test: Could the user approve this right now with zero editing? If no, rewrite.
- For drafted_email: "to" must be a real email address from the signals. No email visible? Use decision artifact instead.
- For document: every value must be filled from the data. Any blank = use decision artifact instead.
- For decision: pre-fill every option with specifics from the signal data. "Leave in 60 days targeting $X+" not "Option A: leave."
- For wait_rationale: cite a SPECIFIC prior outcome with date and result.

Output JSON only:
{
  "directive": "one sentence imperative naming a specific person or commitment",
  "artifact_type": "drafted_email | document | decision | calendar_event | research_brief | wait_rationale",
  "artifact": <the finished work product as JSON>,
  "evidence": "one sentence citing specific data from below",
  "domain": "career | family | financial | health | project",
  "why_now": "one sentence why today"
}`;

const ACTION_TYPE_HINTS = {
  send_message:   'drafted_email',
  write_document: 'document',
  make_decision:  'decision',
  schedule:       'calendar_event',
  research:       'research_brief',
  do_nothing:     'wait_rationale',
};

const ARTIFACT_TO_ACTION = {
  drafted_email:   'send_message',
  document:        'write_document',
  decision:        'make_decision',
  calendar_event:  'schedule',
  research_brief:  'research',
  wait_rationale:  'do_nothing',
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('Scoring open loops for user ' + USER_ID + '...\n');

const winner = await scoreOpenLoops();

if (!winner || winner.score < 2.0) {
  const reason = winner
    ? `Highest scorer: "${winner.title.slice(0, 80)}" at ${winner.score.toFixed(2)} — below 2.0 threshold`
    : 'No open loops found';
  console.log(`\ndo_nothing — ${reason}`);
  process.exit(0);
}

console.log(`\nWinner: "${winner.title.slice(0, 80)}" score=${winner.score.toFixed(2)} type=${winner.suggestedActionType}`);

// Query approved/skipped for dedup
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const [approvedRes, skippedRes] = await Promise.all([
  supabase.from('tkg_actions')
    .select('directive_text, action_type').eq('user_id', USER_ID)
    .eq('status', 'executed').gte('generated_at', sevenDaysAgo)
    .order('generated_at', { ascending: false }).limit(10),
  supabase.from('tkg_actions')
    .select('directive_text, action_type, skip_reason').eq('user_id', USER_ID)
    .in('status', ['skipped', 'draft_rejected', 'rejected']).gte('generated_at', sevenDaysAgo)
    .order('generated_at', { ascending: false }).limit(10),
]);

const approvedSection = (approvedRes.data ?? []).length > 0
  ? (approvedRes.data ?? []).map(a => `  - [${a.action_type}] ${a.directive_text.slice(0, 120)}`).join('\n')
  : '  None.';
const skippedSection = (skippedRes.data ?? []).length > 0
  ? (skippedRes.data ?? []).map(a => {
      const reason = a.skip_reason ? ` (${a.skip_reason})` : '';
      return `  - [${a.action_type}]${reason} ${a.directive_text.slice(0, 120)}`;
    }).join('\n')
  : '  None.';

const systemPrompt = FOCUSED_SYSTEM
  .replace('{APPROVED_SECTION}', approvedSection)
  .replace('{SKIPPED_SECTION}', skippedSection);

const suggestedArtifact = ACTION_TYPE_HINTS[winner.suggestedActionType] ?? 'decision';

const now = new Date();
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const todayStr = `${dayNames[now.getDay()]} ${monthNames[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

const userPrompt = `TODAY: ${todayStr}

THE SITUATION (selected by scoring algorithm — score ${winner.score.toFixed(2)}/5.0):
Type: ${winner.type}
Title: ${winner.title}
Full context: ${winner.content}
${winner.matchedGoal ? `\nMATCHED GOAL (priority ${winner.matchedGoal.priority}/5): ${winner.matchedGoal.text}` : ''}

SCORE BREAKDOWN:
- Stakes: ${winner.breakdown.stakes} (${winner.matchedGoal ? `matched goal priority ${winner.matchedGoal.priority}` : 'no goal match, default 1.0'})
- Urgency: ${winner.breakdown.urgency.toFixed(2)}
- Tractability: ${winner.breakdown.tractability.toFixed(2)}

SUGGESTED ARTIFACT TYPE: ${suggestedArtifact}
(You may override if the data supports a different type, but justify.)

RELATED SIGNAL DATA (${winner.relatedSignals.length} signals with keyword overlap):
${winner.relatedSignals.length > 0 ? winner.relatedSignals.map((s, i) => `--- Signal ${i + 1} ---\n${s.slice(0, 600)}`).join('\n\n') : 'No related signals found. Use the situation context above.'}

Draft the artifact now. Use real names and details from the data above.`;

// ---------------------------------------------------------------------------
// Claude call
// ---------------------------------------------------------------------------

console.log('\nCalling Claude (scorer-first mode)...\n');

const response = await anthropic.messages.create({
  model:      'claude-sonnet-4-20250514',
  max_tokens: 2000,
  temperature: 0.3,
  system:     systemPrompt,
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

// Post-generation: retry document with placeholders as decision
function hasBlankPlaceholders(text) {
  return /\$_{2,}|_{4,}|\[.*?\]|TBD|\?{3,}|__\/__|\(\s*date\s*\)|\(\s*amount\s*\)/i.test(text);
}

if (
  parsed &&
  (parsed.artifact_type === 'document' || parsed.artifact_type === 'write_document') &&
  parsed.artifact &&
  hasBlankPlaceholders(JSON.stringify(parsed.artifact))
) {
  console.log('[RETRY] Document has placeholders — retrying as decision...');
  const retryResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514', max_tokens: 2000, temperature: 0.3,
    system: systemPrompt,
    messages: [
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: raw },
      { role: 'user', content: 'Your document has blank placeholders. Use a "decision" artifact instead. Frame the choice with specifics from the data. Return JSON only.' },
    ],
  });
  try {
    const retryRaw = retryResponse.content[0]?.type === 'text' ? retryResponse.content[0].text : '';
    parsed = JSON.parse(retryRaw.replace(/```json\n?|\n?```/g, '').trim());
    console.log('[RETRY] Produced artifact_type:', parsed.artifact_type);
  } catch {
    console.log('[RETRY] Parse failed — keeping original');
  }
}

// ---------------------------------------------------------------------------
// Write to tkg_actions
// ---------------------------------------------------------------------------

const actionType = parsed.action_type ?? ARTIFACT_TO_ACTION[parsed.artifact_type] ?? 'research';
const evidenceArr = typeof parsed.evidence === 'string'
  ? [{ type: 'signal', description: parsed.evidence, date: null }]
  : (parsed.evidence ?? []);

const scoreEvidence = `[score=${winner.score.toFixed(2)}: ${winner.breakdown.stakes}S*${winner.breakdown.urgency.toFixed(2)}U*${winner.breakdown.tractability.toFixed(2)}T]`;

const { data: actionRow, error: actionErr } = await supabase
  .from('tkg_actions')
  .insert({
    user_id:        USER_ID,
    directive_text: parsed.directive,
    action_type:    actionType,
    confidence:     50, // Bayesian default
    reason:         `${parsed.why_now ?? parsed.evidence ?? ''} ${scoreEvidence}`,
    evidence:       evidenceArr,
    status:         'pending_approval',
    generated_at:   new Date().toISOString(),
    execution_result: parsed.artifact ? { artifact: parsed.artifact } : null,
  })
  .select('id')
  .single();

if (actionErr) {
  console.error('tkg_actions write failed: ' + actionErr.message);
} else {
  console.log(`Directive logged to tkg_actions (id: ${actionRow.id})\n`);
}

// Also write to tkg_briefings
const today = new Date().toISOString().slice(0, 10);
await supabase.from('tkg_briefings').insert({
  user_id:            USER_ID,
  briefing_date:      today,
  generated_at:       new Date().toISOString(),
  top_insight:        parsed.evidence,
  confidence:         50,
  recommended_action: parsed.directive,
  stats: {
    goalsActive:  0,
    fullBrief:    parsed.why_now ?? parsed.evidence,
    directive:    parsed,
    score:        winner.score,
    breakdown:    winner.breakdown,
  },
});

// ---------------------------------------------------------------------------
// Print output
// ---------------------------------------------------------------------------

const ACTION_EMOJI = {
  write_document: '📝', send_message: '📨', make_decision: '⚖️',
  do_nothing: '⏸️', schedule: '📅', research: '🔍',
};

const displayType = parsed.artifact_type ?? parsed.action_type ?? 'unknown';

console.log('═'.repeat(60));
console.log('CONVICTION DIRECTIVE — ' + today);
console.log('═'.repeat(60));
console.log('');
console.log(`${ACTION_EMOJI[actionType] ?? '▶'} [${displayType.toUpperCase()}]`);
if (parsed.domain) console.log(`DOMAIN     : ${parsed.domain}`);
console.log('');
console.log(parsed.directive);
console.log('');
console.log('─'.repeat(60));
console.log(`SCORE      : ${winner.score.toFixed(2)}/5.0`);
console.log(`BREAKDOWN  : stakes=${winner.breakdown.stakes} urgency=${winner.breakdown.urgency.toFixed(2)} tractability=${winner.breakdown.tractability.toFixed(2)}`);
if (winner.matchedGoal) console.log(`GOAL MATCH : [p${winner.matchedGoal.priority}] ${winner.matchedGoal.text.slice(0, 100)}`);
console.log(`EVIDENCE   : ${typeof parsed.evidence === 'string' ? parsed.evidence : JSON.stringify(parsed.evidence)}`);
if (parsed.why_now) console.log(`WHY NOW    : ${parsed.why_now}`);
console.log('─'.repeat(60));

if (parsed.artifact) {
  console.log('\nARTIFACT:');
  console.log(typeof parsed.artifact === 'object' ? JSON.stringify(parsed.artifact, null, 2) : parsed.artifact);
}

console.log('');
