/**
 * generate-briefing.mjs — Scorer-first conviction engine, standalone runner.
 *
 * Flow:
 *   1. Score all open loops (commitments, signals, relationships) with math
 *   2. Check emergent patterns (repeat cycles, approval gaps, commitment decay)
 *   3. Pass ONLY the winning loop + context to Claude
 *   4. Claude writes the artifact — it does NOT choose what to work on
 *
 * v2: freshness decay, skip penalties, emergent pattern detection,
 *     relationship enrichment, self-feed signal filtering
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
// Scorer — deterministic open-loop ranker (mirrors lib/briefing/scorer.ts v2)
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

// v2: sigmoid midpoint at 5 days, slope 1.0
function deadlineUrgency(dueAt, impliedDueAt) {
  const deadline = dueAt || impliedDueAt;
  if (!deadline) return 0.3;
  const daysUntilDue = (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntilDue < 0) return 1.0;
  return 1 / (1 + Math.exp(1.0 * (daysUntilDue - 5)));
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

// v2: freshness — penalize recently-surfaced loops
async function getFreshness(loopTitle) {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data: recentActions } = await supabase
      .from('tkg_actions')
      .select('directive_text, generated_at, status')
      .eq('user_id', USER_ID)
      .gte('generated_at', threeDaysAgo)
      .in('status', ['pending_approval', 'executed', 'skipped', 'draft_rejected'])
      .limit(30);

    if (!recentActions || recentActions.length === 0) return 1.0;

    const titleWords = new Set(
      loopTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 4)
    );
    if (titleWords.size === 0) return 1.0;

    let similarCount = 0;
    let anySkipped = false;
    for (const a of recentActions) {
      const dirText = (a.directive_text ?? '').toLowerCase();
      const overlap = [...titleWords].filter(w => dirText.includes(w)).length;
      if (overlap >= 2 || (overlap >= 1 && titleWords.size <= 2)) {
        similarCount++;
        if (a.status === 'skipped' || a.status === 'draft_rejected') anySkipped = true;
      }
    }

    if (similarCount === 0) return 1.0;
    let freshness = Math.max(0.3, 1.0 - (similarCount * 0.2));
    if (anySkipped) freshness *= 0.5;
    return Math.max(0.1, freshness);
  } catch {
    return 1.0;
  }
}

// v2: relationship enrichment
async function enrichRelationshipContext(entityName, entityPatterns) {
  const parts = [];

  if (entityPatterns && typeof entityPatterns === 'object') {
    const patterns = Array.isArray(entityPatterns) ? entityPatterns : [entityPatterns];
    const patternText = patterns
      .map(p => typeof p === 'string' ? p : p.pattern ?? p.description ?? '')
      .filter(s => s.length > 0)
      .slice(0, 3);
    if (patternText.length > 0) parts.push('Known patterns: ' + patternText.join('; '));
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const { data: signals } = await supabase
      .from('tkg_signals')
      .select('content, source, occurred_at')
      .eq('user_id', USER_ID)
      .eq('processed', true)
      .gte('occurred_at', thirtyDaysAgo)
      .order('occurred_at', { ascending: false })
      .limit(100);

    if (signals && signals.length > 0) {
      const nameLower = entityName.toLowerCase();
      const firstName = nameLower.split(/\s+/)[0];
      const mentioning = signals
        .filter(s => {
          const content = decrypt(s.content ?? '').toLowerCase();
          return content.includes(nameLower) || content.includes(firstName);
        })
        .slice(0, 3);

      if (mentioning.length > 0) {
        parts.push('Recent mentions:');
        for (const s of mentioning) {
          const content = decrypt(s.content ?? '');
          const date = (s.occurred_at ?? '').slice(0, 10);
          parts.push('  [' + date + '] ' + content.slice(0, 300));
        }
      }
    }
  } catch { /* non-critical */ }

  return parts.join('\n');
}

// v2: emergent pattern detection
async function detectEmergentPatterns() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const patterns = [];

  try {
    const { data: actions } = await supabase
      .from('tkg_actions')
      .select('id, directive_text, action_type, status, generated_at, executed_at, execution_result, feedback_weight, skip_reason')
      .eq('user_id', USER_ID)
      .gte('generated_at', thirtyDaysAgo)
      .order('generated_at', { ascending: false })
      .limit(100);

    if (!actions || actions.length < 3) return patterns;

    // 1. REPEAT CYCLE: same topic surfaced 3+ times without approval
    const topicClusters = {};
    for (const a of actions) {
      const text = (a.directive_text ?? '').toLowerCase();
      const keywords = text.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length >= 5);
      const keyPair = keywords.slice(0, 3).sort().join('+');
      if (!keyPair) continue;
      if (!topicClusters[keyPair]) topicClusters[keyPair] = [];
      topicClusters[keyPair].push({
        text: a.directive_text ?? '',
        status: a.status ?? '',
        date: (a.generated_at ?? '').slice(0, 10),
      });
    }

    for (const [topic, items] of Object.entries(topicClusters)) {
      const pending = items.filter(i => i.status === 'pending_approval');
      if (pending.length >= 3) {
        const approvedCount = items.filter(i => i.status === 'executed').length;
        patterns.push({
          type: 'repeat_cycle',
          title: 'Repeating directive: "' + pending[0].text.slice(0, 60) + '"',
          insight: 'This topic has been generated ' + pending.length + ' times without action (' + approvedCount + ' ever approved). The system keeps suggesting it but you haven\'t engaged. Either approve one version, skip it to teach the system, or the underlying situation needs a different approach.',
          dataPoints: pending.map(p => '[' + p.date + '] ' + p.text.slice(0, 100)),
          score: 3.0 + (pending.length * 0.3),
          suggestedActionType: 'make_decision',
        });
      }
    }

    // 2. APPROVAL WITHOUT EXECUTION
    const approvedNoExec = [];
    for (const a of actions) {
      if (a.status !== 'executed') continue;
      const execResult = a.execution_result ?? {};
      const artifact = execResult.artifact;
      if (!artifact) continue;
      if (artifact.type === 'email' && !execResult.sent && !execResult.sent_at) {
        approvedNoExec.push('[' + (a.generated_at ?? '').slice(0, 10) + '] ' + (a.directive_text ?? '').slice(0, 100));
      }
    }

    if (approvedNoExec.length >= 2) {
      patterns.push({
        type: 'approval_without_execution',
        title: approvedNoExec.length + ' approved directives may not have executed',
        insight: 'You approved ' + approvedNoExec.length + ' email directives but the system couldn\'t confirm they were sent.',
        dataPoints: approvedNoExec.slice(0, 5),
        score: 3.5,
        suggestedActionType: 'research',
      });
    }

    // 3. COMMITMENT DECAY: high skip rate on specific action types
    const typeStats = {};
    for (const a of actions) {
      const aType = a.action_type ?? 'unknown';
      if (!typeStats[aType]) typeStats[aType] = { total: 0, skipped: 0, approved: 0 };
      typeStats[aType].total++;
      if (a.status === 'skipped' || a.status === 'draft_rejected') typeStats[aType].skipped++;
      if (a.status === 'executed') typeStats[aType].approved++;
    }

    for (const [aType, stats] of Object.entries(typeStats)) {
      if (stats.total >= 5 && stats.skipped / stats.total > 0.7) {
        patterns.push({
          type: 'commitment_decay',
          title: aType + ' directives are being ignored (' + Math.round(stats.skipped / stats.total * 100) + '% skip rate)',
          insight: 'Of ' + stats.total + ' ' + aType + ' directives, ' + stats.skipped + ' were skipped and only ' + stats.approved + ' approved.',
          dataPoints: ['Total: ' + stats.total, 'Approved: ' + stats.approved, 'Skipped: ' + stats.skipped],
          score: 2.5,
          suggestedActionType: 'do_nothing',
        });
      }
    }

    // 4. TEMPORAL CLUSTER
    const dayOfWeekApprovals = {};
    const dayOfWeekSkips = {};
    for (const a of actions) {
      const day = new Date(a.generated_at).getDay();
      if (a.status === 'executed') dayOfWeekApprovals[day] = (dayOfWeekApprovals[day] ?? 0) + 1;
      if (a.status === 'skipped' || a.status === 'draft_rejected') dayOfWeekSkips[day] = (dayOfWeekSkips[day] ?? 0) + 1;
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (let day = 0; day < 7; day++) {
      const approvals = dayOfWeekApprovals[day] ?? 0;
      const skips = dayOfWeekSkips[day] ?? 0;
      const total = approvals + skips;
      if (total >= 3 && approvals > 0 && approvals / total > 0.7) {
        patterns.push({
          type: 'temporal_cluster',
          title: 'You\'re most receptive on ' + dayNames[day] + 's',
          insight: dayNames[day] + 's have a ' + Math.round(approvals / total * 100) + '% approval rate.',
          dataPoints: [dayNames[day] + ': ' + approvals + ' approved, ' + skips + ' skipped'],
          score: 1.5,
          suggestedActionType: 'do_nothing',
        });
      }
    }
  } catch (err) {
    console.warn('[scorer] detectEmergentPatterns error:', err.message ?? err);
  }

  patterns.sort((a, b) => b.score - a.score);
  return patterns;
}

// ---------------------------------------------------------------------------
// Main scorer
// ---------------------------------------------------------------------------

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

  const { data: allRecentSignals } = await supabase.from('tkg_signals')
    .select('content, source, occurred_at').eq('user_id', USER_ID)
    .gte('occurred_at', fourteenDaysAgo).eq('processed', true)
    .order('occurred_at', { ascending: false }).limit(50);
  const decryptedSignals = (allRecentSignals ?? []).map(s => decrypt(s.content ?? ''));

  // Build candidates
  const candidates = [];

  for (const c of commitments) {
    const text = c.description + (c.source_context ? ' — ' + c.source_context : '');
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
    // v2: skip self-fed directive signals
    if (text.startsWith('[Foldera Directive')) continue;
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
    const text = e.name + ': last contact ' + daysSince + ' days ago, ' + e.total_interactions + ' total interactions';
    const mg = matchGoal(text, goals);
    candidates.push({
      id: e.id, type: 'relationship', title: 'Follow up with ' + e.name, content: text,
      actionType: 'send_message',
      urgency: relationshipUrgency(daysSince),
      matchedGoal: mg, domain: inferDomain(mg, text),
      entityPatterns: e.patterns, entityName: e.name,
    });
  }

  // Score and rank (v2: includes freshness + emergent patterns)
  const scored = [];

  for (const c of candidates) {
    const stakes = c.matchedGoal ? c.matchedGoal.priority : 1.0;

    // Tractability from tkg_pattern_metrics (v2: includes failed_outcomes)
    let tractability = 0.5;
    try {
      const { data: pm } = await supabase.from('tkg_pattern_metrics')
        .select('total_activations, successful_outcomes, failed_outcomes')
        .eq('user_id', USER_ID).eq('pattern_hash', c.actionType + ':' + c.domain)
        .maybeSingle();
      if (pm) {
        const successes = pm.successful_outcomes ?? 0;
        const failures = pm.failed_outcomes ?? 0;
        tractability = Math.max(0.1, (successes + 1) / (successes + failures + 2));
      }
    } catch { /* use default */ }

    // v2: freshness
    const freshness = await getFreshness(c.title);

    const score = stakes * c.urgency * tractability * freshness;

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

    // v2: relationship enrichment
    let relationshipContext;
    if (c.type === 'relationship' && c.entityName) {
      relationshipContext = await enrichRelationshipContext(c.entityName, c.entityPatterns);
    }

    scored.push({
      id: c.id, type: c.type, title: c.title, content: c.content,
      suggestedActionType: c.actionType,
      matchedGoal: c.matchedGoal, score,
      breakdown: { stakes, urgency: c.urgency, tractability, freshness },
      relatedSignals: related,
      relationshipContext,
    });
  }

  // v2: emergent patterns compete with regular candidates
  const emergent = await detectEmergentPatterns();
  for (const ep of emergent) {
    scored.push({
      id: 'emergent-' + ep.type,
      type: 'emergent',
      title: ep.title,
      content: ep.insight + '\n\nData:\n' + ep.dataPoints.join('\n'),
      suggestedActionType: ep.suggestedActionType,
      matchedGoal: null,
      score: ep.score,
      breakdown: { stakes: ep.score, urgency: 1.0, tractability: 1.0, freshness: 1.0 },
      relatedSignals: [],
    });
  }

  scored.sort((a, b) => b.score - a.score);

  // Print top 5
  console.log('\n[scorer] Top 5 candidates:');
  for (const s of scored.slice(0, 5)) {
    const f = s.breakdown.freshness !== undefined ? ' * ' + s.breakdown.freshness.toFixed(2) + 'F' : '';
    console.log(
      '  ' + s.score.toFixed(2) + ' = ' + s.breakdown.stakes + 'S * ' + s.breakdown.urgency.toFixed(2) + 'U * ' + s.breakdown.tractability.toFixed(2) + 'T' + f + ' | [' + s.type + '] ' + s.title.slice(0, 80)
    );
  }

  const winner = scored[0];
  if (!winner) return null;

  // Classify kill reasons for top 3 runner-ups
  const runnerUps = scored.slice(1, 4);
  const deprioritized = runnerUps.map(loop => classifyKillReason(loop, winner.score));

  if (deprioritized.length > 0) {
    console.log('\n[scorer] Deprioritized (killed):');
    for (const d of deprioritized) {
      console.log('  [' + d.killReason.toUpperCase() + '] ' + d.title.slice(0, 60) + ' \u2014 ' + d.killExplanation.slice(0, 80));
    }
  }

  return { winner, deprioritized };
}

function classifyKillReason(loop, winnerScore) {
  const { stakes, urgency, tractability } = loop.breakdown;

  let killReason;
  let killExplanation;

  if (stakes <= 1.5 && urgency >= 0.5) {
    killReason = 'noise';
    killExplanation = 'Urgency ' + urgency.toFixed(2) + ' but stakes only ' + stakes + ' (no goal alignment). Feels pressing but doesn\'t move a priority forward.';
  } else if (stakes >= 2.0 && urgency < 0.4) {
    killReason = 'not_now';
    killExplanation = 'Stakes ' + stakes + ' but urgency only ' + urgency.toFixed(2) + '. Important, but the window is far enough out that today isn\'t the day.';
  } else if (tractability < 0.4 && stakes >= 1.5 && urgency >= 0.3) {
    killReason = 'trap';
    killExplanation = 'Tractability only ' + tractability.toFixed(2) + ' \u2014 historical data shows low follow-through on this type. High effort, low payoff.';
  } else if (stakes <= 1.5) {
    killReason = 'noise';
    killExplanation = 'Stakes ' + stakes + ' dragged the score to ' + loop.score.toFixed(2) + ' vs winner at ' + winnerScore.toFixed(2) + '. No aligned goal to justify acting.';
  } else if (urgency < 0.4) {
    killReason = 'not_now';
    killExplanation = 'Urgency ' + urgency.toFixed(2) + ' is too low. This matters but not today.';
  } else {
    killReason = 'trap';
    killExplanation = 'Tractability ' + tractability.toFixed(2) + ' is the drag. Past outcomes on ' + loop.suggestedActionType + ' actions in this domain are weak.';
  }

  return {
    title: loop.title,
    score: loop.score,
    breakdown: loop.breakdown,
    killReason,
    killExplanation,
  };
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

ALREADY APPROVED (do not repeat):
{APPROVED_SECTION}

SKIPPED (do not regenerate similar):
{SKIPPED_SECTION}

CUTTING ROOM FLOOR:
Below the main artifact, you MUST include a "cutting_room_floor" array in your JSON output. This section lists things the user does NOT need to worry about today — the system already evaluated and killed them. For each item, translate the mathematical kill reason into a ruthless, plainly worded one-sentence justification. Be specific: name the person, topic, or commitment. The user should feel RELIEF reading this list, not guilt.

Kill reason types:
- NOISE: High urgency but low stakes. Feels pressing but doesn't move a priority forward.
- NOT NOW: High stakes but low urgency. Important but today isn't the day.
- TRAP: High stakes and urgency but low tractability. History shows low follow-through on this type.

Output JSON only:
{
  "directive": "one sentence imperative naming a specific person or commitment",
  "artifact_type": "drafted_email | document | decision | calendar_event | research_brief | wait_rationale",
  "artifact": <the finished work product as JSON>,
  "evidence": "one sentence citing specific data from below",
  "domain": "career | family | financial | health | project",
  "why_now": "one sentence why today",
  "cutting_room_floor": [
    {"title": "short label", "kill_reason": "NOISE | NOT_NOW | TRAP", "justification": "one ruthless sentence why this doesn't deserve attention today"}
  ]
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

const scorerResult = await scoreOpenLoops();

if (!scorerResult || scorerResult.winner.score < 0.5) {
  const w = scorerResult?.winner;
  const reason = w
    ? 'Highest scorer: "' + w.title.slice(0, 80) + '" at ' + w.score.toFixed(2) + ' — below 0.5 threshold'
    : 'No open loops found';
  console.log('\ndo_nothing — ' + reason);
  process.exit(0);
}

const { winner, deprioritized } = scorerResult;

console.log('\nWinner: "' + winner.title.slice(0, 80) + '" score=' + winner.score.toFixed(2) + ' type=' + winner.suggestedActionType);

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
  ? (approvedRes.data ?? []).map(a => '  - [' + a.action_type + '] ' + a.directive_text.slice(0, 120)).join('\n')
  : '  None.';
const skippedSection = (skippedRes.data ?? []).length > 0
  ? (skippedRes.data ?? []).map(a => {
      const reason = a.skip_reason ? ' (' + a.skip_reason + ')' : '';
      return '  - [' + a.action_type + ']' + reason + ' ' + a.directive_text.slice(0, 120);
    }).join('\n')
  : '  None.';

const systemPrompt = FOCUSED_SYSTEM
  .replace('{APPROVED_SECTION}', approvedSection)
  .replace('{SKIPPED_SECTION}', skippedSection);

const suggestedArtifact = ACTION_TYPE_HINTS[winner.suggestedActionType] ?? 'decision';

const now = new Date();
const dayNamesArr = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const todayStr = dayNamesArr[now.getDay()] + ' ' + monthNames[now.getMonth()] + ' ' + now.getDate() + ', ' + now.getFullYear();

// v2: relationship context and emergent pattern sections
const relationshipSection = winner.relationshipContext
  ? '\nRELATIONSHIP CONTEXT:\n' + winner.relationshipContext + '\n'
  : '';

const emergentSection = winner.type === 'emergent'
  ? '\nEMERGENT PATTERN DETECTED — this is a meta-observation about the user\'s behavior, not a regular open loop. Draft an insight artifact that surfaces this pattern with specific data. The user should feel seen, not judged.\n'
  : '';

// Build deprioritized section for the LLM
const deprioritizedPromptSection = deprioritized.length > 0
  ? '\n\nDEPRIORITIZED LOOPS (include these in cutting_room_floor — translate kill reasons into plain language):\n' + deprioritized.map((d, i) => (i + 1) + '. [' + d.killReason.toUpperCase() + '] "' + d.title.slice(0, 100) + '" (score ' + d.score.toFixed(2) + ') \u2014 ' + d.killExplanation).join('\n') + '\n'
  : '';

const userPrompt = 'TODAY: ' + todayStr + '\n\nTHE SITUATION (selected by scoring algorithm — score ' + winner.score.toFixed(2) + '/5.0):\nType: ' + winner.type + '\nTitle: ' + winner.title + '\nFull context: ' + winner.content + (winner.matchedGoal ? '\n\nMATCHED GOAL (priority ' + winner.matchedGoal.priority + '/5): ' + winner.matchedGoal.text : '') + '\n\nSCORE BREAKDOWN:\n- Stakes: ' + winner.breakdown.stakes + ' (' + (winner.matchedGoal ? 'matched goal priority ' + winner.matchedGoal.priority : 'no goal match, default 1.0') + ')\n- Urgency: ' + winner.breakdown.urgency.toFixed(2) + '\n- Tractability: ' + winner.breakdown.tractability.toFixed(2) + '\n- Freshness: ' + (winner.breakdown.freshness?.toFixed(2) ?? '1.00') + ' (1.0 = never surfaced, lower = recently generated)' + relationshipSection + emergentSection + '\n\nSUGGESTED ARTIFACT TYPE: ' + suggestedArtifact + '\n(You may override if the data supports a different type, but justify.)\n\nRELATED SIGNAL DATA (' + winner.relatedSignals.length + ' signals with keyword overlap):\n' + (winner.relatedSignals.length > 0 ? winner.relatedSignals.map((s, i) => '--- Signal ' + (i + 1) + ' ---\n' + s.slice(0, 600)).join('\n\n') : 'No related signals found. Use the situation context above.') + deprioritizedPromptSection + '\n\nDraft the artifact now. Use real names and details from the data above.';

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

const freshnessStr = winner.breakdown.freshness?.toFixed(2) ?? '1.00';
const scoreEvidence = '[score=' + winner.score.toFixed(2) + ': ' + winner.breakdown.stakes + 'S*' + winner.breakdown.urgency.toFixed(2) + 'U*' + winner.breakdown.tractability.toFixed(2) + 'T*' + freshnessStr + 'F]';

const { data: actionRow, error: actionErr } = await supabase
  .from('tkg_actions')
  .insert({
    user_id:        USER_ID,
    directive_text: parsed.directive,
    action_type:    actionType,
    confidence:     50, // Bayesian default
    reason:         (parsed.why_now ?? parsed.evidence ?? '') + ' ' + scoreEvidence,
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
  console.log('Directive logged to tkg_actions (id: ' + actionRow.id + ')\n');
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
  write_document: '\u{1f4dd}', send_message: '\u{1f4e8}', make_decision: '\u2696\ufe0f',
  do_nothing: '\u23f8\ufe0f', schedule: '\u{1f4c5}', research: '\u{1f50d}',
};

const displayType = parsed.artifact_type ?? parsed.action_type ?? 'unknown';

console.log('\u2550'.repeat(60));
console.log('CONVICTION DIRECTIVE \u2014 ' + today);
console.log('\u2550'.repeat(60));
console.log('');
console.log((ACTION_EMOJI[actionType] ?? '\u25b6') + ' [' + displayType.toUpperCase() + ']');
if (parsed.domain) console.log('DOMAIN     : ' + parsed.domain);
console.log('');
console.log(parsed.directive);
console.log('');
console.log('\u2500'.repeat(60));
console.log('SCORE      : ' + winner.score.toFixed(2) + '/5.0');
console.log('BREAKDOWN  : stakes=' + winner.breakdown.stakes + ' urgency=' + winner.breakdown.urgency.toFixed(2) + ' tractability=' + winner.breakdown.tractability.toFixed(2) + ' freshness=' + (winner.breakdown.freshness?.toFixed(2) ?? '1.00'));
if (winner.matchedGoal) console.log('GOAL MATCH : [p' + winner.matchedGoal.priority + '] ' + winner.matchedGoal.text.slice(0, 100));
console.log('EVIDENCE   : ' + (typeof parsed.evidence === 'string' ? parsed.evidence : JSON.stringify(parsed.evidence)));
if (parsed.why_now) console.log('WHY NOW    : ' + parsed.why_now);
if (winner.type === 'emergent') console.log('TYPE       : EMERGENT PATTERN (proactive intelligence)');
console.log('\u2500'.repeat(60));

if (parsed.artifact) {
  console.log('\nARTIFACT:');
  console.log(typeof parsed.artifact === 'object' ? JSON.stringify(parsed.artifact, null, 2) : parsed.artifact);
}

// Display cutting room floor
if (parsed.cutting_room_floor && parsed.cutting_room_floor.length > 0) {
  console.log('\n' + '\u2500'.repeat(60));
  console.log('CUTTING ROOM FLOOR \u2014 what you don\'t need to worry about today');
  console.log('\u2500'.repeat(60));
  const KILL_EMOJI = { NOISE: '\u{1f507}', NOT_NOW: '\u23f3', TRAP: '\u26a0\ufe0f' };
  for (const item of parsed.cutting_room_floor) {
    const reason = (item.kill_reason ?? '').toUpperCase().replace(' ', '_');
    const emoji = KILL_EMOJI[reason] ?? '\u2716';
    console.log(emoji + ' [' + reason + '] ' + item.title);
    console.log('  ' + item.justification);
  }
}

console.log('');
