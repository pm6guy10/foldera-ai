/**
 * seed-goals.mjs — Extract and seed Brandon's goals into tkg_goals.
 *
 * Reads the existing behavioral graph (tkg_commitments + tkg_entities.patterns)
 * and calls Claude to surface declared goals already embedded in the data.
 * Writes to tkg_goals with source='extracted'.
 *
 * Safe to run multiple times — skips insert if goals already exist for user.
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
const { createClient } = await import('@supabase/supabase-js');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase  = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Check if goals already seeded
const { count: existingCount } = await supabase
  .from('tkg_goals')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', USER_ID);

if (existingCount > 0) {
  console.log(`Goals already seeded (${existingCount} exist). To re-seed, delete existing rows first.`);
  console.log('Current goals:');
  const { data: goals } = await supabase
    .from('tkg_goals')
    .select('goal_text, goal_category, priority')
    .eq('user_id', USER_ID)
    .order('priority', { ascending: false });
  goals?.forEach(g => console.log(`  [${g.goal_category}, p${g.priority}] ${g.goal_text}`));
  process.exit(0);
}

console.log('Reading identity graph for user ' + USER_ID + '...');

// Pull all available behavioral data
const [commitmentsRes, entityRes, signalsRes] = await Promise.all([
  supabase
    .from('tkg_commitments')
    .select('description, category, status, source_context, risk_factors')
    .eq('user_id', USER_ID)
    .order('made_at', { ascending: false })
    .limit(60),

  supabase
    .from('tkg_entities')
    .select('patterns')
    .eq('user_id', USER_ID)
    .eq('name', 'self')
    .maybeSingle(),

  supabase
    .from('tkg_signals')
    .select('content, occurred_at')
    .eq('user_id', USER_ID)
    .eq('processed', true)
    .order('occurred_at', { ascending: false })
    .limit(10),
]);

const commitments = commitmentsRes.data ?? [];
const patterns    = (entityRes.data?.patterns) ? entityRes.data.patterns : {};
const signals     = signalsRes.data ?? [];

console.log(`  Commitments: ${commitments.length}`);
console.log(`  Patterns: ${Object.keys(patterns).length}`);
console.log(`  Signals (sample): ${signals.length}`);

// Build context for goal extraction
const commitmentText = commitments
  .map(c => `• [${c.category}/${c.status}] ${c.description}${c.source_context ? ' — context: ' + String(c.source_context).slice(0, 100) : ''}`)
  .join('\n');

const patternText = Object.values(patterns)
  .map(p => `• ${p.name} (${p.activation_count}×): ${p.description}`)
  .join('\n') || 'None';

const signalSamples = signals
  .map(s => String(s.content).slice(0, 400))
  .join('\n---\n');

const GOAL_EXTRACTION_SYSTEM = `You are analyzing a behavioral history to extract the person's underlying goals.

Look at their decisions (what they have committed to), their behavioral patterns (how they consistently act), and conversation samples (what they talk about with AI assistants).

Extract 6-12 specific, concrete goals this person is clearly working toward, even if they have never stated them explicitly. Focus on goals that are directly evidenced by their behavior — not aspirational noise.

Goal categories must be one of: career, financial, relationship, health, project, other.

Priority (1=lowest, 5=highest) reflects how much energy and decision-making time this person is actually devoting to this goal based on the evidence.

Return JSON only:
{
  "goals": [
    {
      "goal_text": "Specific, concrete goal statement",
      "goal_category": "career | financial | relationship | health | project | other",
      "priority": 1
    }
  ]
}`;

const userPrompt = `DECISIONS AND COMMITMENTS (${commitments.length} total):
${commitmentText || 'None.'}

BEHAVIORAL PATTERNS (${Object.keys(patterns).length} identified):
${patternText}

CONVERSATION SAMPLES (${signals.length} recent):
${signalSamples || 'None.'}

Extract the goals vector from this behavioral history.`;

console.log('\nCalling Claude to extract goals from behavioral history...');

const response = await anthropic.messages.create({
  model:      'claude-sonnet-4-6',
  max_tokens: 1200,
  system:     GOAL_EXTRACTION_SYSTEM,
  messages:   [{ role: 'user', content: userPrompt }],
});

const raw = response.content[0]?.type === 'text' ? response.content[0].text : '';
let parsed = null;
try {
  parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim());
} catch (_) {
  console.error('Failed to parse Claude response:', raw.slice(0, 300));
  process.exit(1);
}

const goals = parsed.goals ?? [];
if (goals.length === 0) {
  console.log('No goals extracted. Behavioral history may be too sparse.');
  process.exit(0);
}

// Insert into tkg_goals
const rows = goals.map(g => ({
  user_id:       USER_ID,
  goal_text:     g.goal_text,
  goal_category: g.goal_category,
  priority:      Math.max(1, Math.min(5, Number(g.priority) || 3)),
  source:        'extracted',
}));

const { error: insertErr } = await supabase.from('tkg_goals').insert(rows);
if (insertErr) {
  console.error('Insert failed:', insertErr.message);
  process.exit(1);
}

console.log(`\n✓ Seeded ${rows.length} goals into tkg_goals:\n`);
goals.forEach(g => {
  console.log(`  [${g.goal_category}, p${g.priority}] ${g.goal_text}`);
});
console.log('\nGoals vector is ready. Run generate-briefing.mjs to generate the first conviction directive.');
