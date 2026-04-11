/**
 * UX Audit — Parts 3, 4, 5
 *
 * Part 3: LLM UX evaluator — sends screenshots + text + elements to Claude
 * Part 4: Report generator — compiles FOLDERA_UX_AUDIT.md
 * Part 5: Usability heuristics scoring
 *
 * Usage: npx tsx scripts/ux-audit.ts
 *
 * Requires: ANTHROPIC_API_KEY and ALLOW_PAID_LLM=true for LLM eval (or heuristic-only / offline).
 */

import * as fs from 'fs';
import * as path from 'path';

import { isPaidLlmAllowed } from '../lib/llm/paid-llm-gate';

const OUTPUT_DIR = path.resolve(process.cwd(), 'audit-output');
const REPORT_PATH = path.resolve(process.cwd(), 'FOLDERA_UX_AUDIT.md');

// ── Types ────────────────────────────────────────────────────────────────────

interface AuditResult {
  route: string;
  viewport: string;
  viewportWidth: number;
  title: string;
  notBlank: boolean;
  screenshotFile: string;
  visibleTextLength: number;
  totalElements: number;
  visibleElements: number;
  primaryCTA: { text: string; tag: string } | null;
  hasOverflow: boolean;
  scrollWidth: number;
  consoleErrors: string[];
  pageErrors: string[];
  authenticated?: boolean;
  passed: boolean;
}

interface ClickflowReport {
  route: string;
  viewport: string;
  totalInteractive: number;
  clickResults: Array<{
    element: { text: string; tag: string; href: string | null };
    action: string;
    resultUrl: string;
    routeChanged: boolean;
    modalAppeared: boolean;
    errorAppeared: boolean;
    newContent: string;
    deadEnd: boolean;
  }>;
  duplicateCTAs: Array<{ text: string; count: number }>;
  deadEnds: string[];
  noOpButtons: string[];
}

interface LLMEvaluation {
  route: string;
  viewport: string;
  scores: {
    clarity_5sec: number;
    next_action_obvious: number;
    confusion_level: number;
    trust_level: number;
    context_understanding: number;
  };
  confusingText: string[];
  confusingButtons: string[];
  missingExplanations: string[];
  layoutProblems: string[];
  trustBreakers: string[];
  shouldRemove: string[];
  shouldEmphasize: string[];
  passFail: 'PASS' | 'FAIL';
  summary: string;
}

interface HeuristicScore {
  route: string;
  viewport: string;
  clarity5sec: number;
  oneObviousStep: number;
  lowCognitiveLoad: number;
  trustBeforeData: number;
  visualHierarchy: number;
  noMisleadingUI: number;
  noWhatDoIDo: number;
  total: number;
}

interface UXIssue {
  page: string;
  viewport: string;
  element: string;
  problem: string;
  severity: 'critical' | 'major' | 'minor';
  recommendation: string;
}

// ── File loading ─────────────────────────────────────────────────────────────

function loadJsonFiles<T>(dir: string): T[] {
  const fullDir = path.join(OUTPUT_DIR, dir);
  if (!fs.existsSync(fullDir)) return [];
  return fs.readdirSync(fullDir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(fullDir, f), 'utf-8')) as T;
      } catch {
        return null;
      }
    })
    .filter((x): x is T => x !== null);
}

function loadTextFile(dir: string, filename: string): string {
  const p = path.join(OUTPUT_DIR, dir, filename);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
}

// ── Part 3: LLM Evaluator ───────────────────────────────────────────────────

const EVALUATOR_PROMPT = `You are a first-time user who has never heard of Foldera.
You landed on this page with no context.
Evaluate the page strictly.

Score 1-10:
1. In 5 seconds, do I understand what this product/page does?
2. Is the next action obvious?
3. Is anything confusing, overloaded, vague, or misplaced?
4. Would I trust this enough to continue?
5. If this is a product step, do I understand why I am here?

Then provide:
- exact confusing text (quote it)
- exact confusing buttons (quote their labels)
- missing explanations
- layout hierarchy problems
- trust-breaking elements
- what should be removed
- what should be emphasized
- whether this page PASSES or FAILS

Respond in valid JSON with this structure:
{
  "scores": {
    "clarity_5sec": <1-10>,
    "next_action_obvious": <1-10>,
    "confusion_level": <1-10 where 10=very confusing>,
    "trust_level": <1-10>,
    "context_understanding": <1-10>
  },
  "confusingText": ["..."],
  "confusingButtons": ["..."],
  "missingExplanations": ["..."],
  "layoutProblems": ["..."],
  "trustBreakers": ["..."],
  "shouldRemove": ["..."],
  "shouldEmphasize": ["..."],
  "passFail": "PASS" or "FAIL",
  "summary": "one paragraph summary"
}`;

async function evaluateWithLLM(
  route: string,
  viewport: string,
  visibleText: string,
  elements: any[],
  screenshotPath: string,
): Promise<LLMEvaluation | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!isPaidLlmAllowed()) {
    console.warn(
      `[ux-audit] Skipping Anthropic LLM eval for ${route} (${viewport}): ALLOW_PAID_LLM is not true.`,
    );
    return null;
  }

  const visibleElements = (elements || []).filter((e: any) => e.visible);
  const elementSummary = visibleElements
    .map((e: any) => `[${e.tag}] "${e.text}" ${e.href ? `→ ${e.href}` : ''} at (${e.x},${e.y})`)
    .join('\n');

  // Build message content
  const contentParts: any[] = [];

  // Try to include screenshot as image
  if (fs.existsSync(screenshotPath)) {
    const imgData = fs.readFileSync(screenshotPath).toString('base64');
    contentParts.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: imgData },
    });
  }

  contentParts.push({
    type: 'text',
    text: `Page: ${route} (${viewport} viewport)

VISIBLE TEXT:
${visibleText.slice(0, 3000)}

CLICKABLE ELEMENTS:
${elementSummary.slice(0, 2000)}

${EVALUATOR_PROMPT}`,
  });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: contentParts }],
      }),
    });

    if (!res.ok) {
      console.error(`[ux-audit] LLM API error for ${route} ${viewport}: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`[ux-audit] Could not parse JSON from LLM response for ${route}`);
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      route,
      viewport,
      ...parsed,
    };
  } catch (err: any) {
    console.error(`[ux-audit] LLM evaluation failed for ${route}: ${err.message}`);
    return null;
  }
}

// ── Part 5: Heuristic scoring ────────────────────────────────────────────────

function scoreHeuristics(result: AuditResult, visibleText: string, elements: any[]): HeuristicScore {
  const visibleEls = (elements || []).filter((e: any) => e.visible);
  const buttonCount = visibleEls.filter((e: any) => e.tag === 'button').length;
  const linkCount = visibleEls.filter((e: any) => e.tag === 'a').length;
  const totalInteractive = buttonCount + linkCount;

  // Clarity in 5 seconds: does the page have a clear headline?
  const hasHeadline = visibleText.length > 20;
  const clarity5sec = hasHeadline && visibleText.length < 5000 ? 8 : hasHeadline ? 6 : 3;

  // One obvious next step
  const hasCTA = !!result.primaryCTA;
  const oneObviousStep = hasCTA && totalInteractive <= 15 ? 8 : hasCTA ? 6 : 3;

  // Low cognitive load
  const lowCognitiveLoad = totalInteractive <= 10 ? 9 : totalInteractive <= 20 ? 7 : totalInteractive <= 30 ? 5 : 3;

  // Trust before data connection
  const hasPrivacyText = /encrypt|privacy|delete|secure/i.test(visibleText);
  const trustBeforeData = hasPrivacyText ? 8 : result.route === '/start' ? 5 : 7;

  // Visual hierarchy
  const visualHierarchy = result.hasOverflow ? 3 : result.notBlank ? 7 : 2;

  // No misleading UI
  const noMisleadingUI = result.consoleErrors.length === 0 && result.pageErrors.length === 0 ? 8 : 4;

  // No "what do I do now?"
  const noWhatDoIDo = hasCTA ? 8 : 3;

  const total = Math.round((clarity5sec + oneObviousStep + lowCognitiveLoad + trustBeforeData + visualHierarchy + noMisleadingUI + noWhatDoIDo) / 7 * 10) / 10;

  return {
    route: result.route,
    viewport: result.viewport,
    clarity5sec,
    oneObviousStep,
    lowCognitiveLoad,
    trustBeforeData,
    visualHierarchy,
    noMisleadingUI,
    noWhatDoIDo,
    total,
  };
}

// ── Issue extraction ─────────────────────────────────────────────────────────

function extractIssues(
  results: AuditResult[],
  clickflows: ClickflowReport[],
  evaluations: LLMEvaluation[],
): UXIssue[] {
  const issues: UXIssue[] = [];

  // From smoke results
  for (const r of results) {
    if (r.hasOverflow) {
      issues.push({
        page: r.route,
        viewport: r.viewport,
        element: 'page body',
        problem: `Horizontal overflow detected (scrollWidth=${r.scrollWidth} > viewport=${r.viewportWidth})`,
        severity: 'major',
        recommendation: 'Check for elements with fixed width or overflowing content at this viewport.',
      });
    }
    if (!r.primaryCTA) {
      issues.push({
        page: r.route,
        viewport: r.viewport,
        element: 'page',
        problem: 'No primary CTA found — user has no obvious next action',
        severity: 'critical',
        recommendation: 'Add a clear primary button or call-to-action.',
      });
    }
    if (r.pageErrors.length > 0) {
      issues.push({
        page: r.route,
        viewport: r.viewport,
        element: 'JavaScript runtime',
        problem: `Uncaught page errors: ${r.pageErrors.join('; ')}`,
        severity: 'critical',
        recommendation: 'Fix JavaScript errors that crash page functionality.',
      });
    }
    if (r.consoleErrors.length > 0) {
      issues.push({
        page: r.route,
        viewport: r.viewport,
        element: 'console',
        problem: `Console errors: ${r.consoleErrors.join('; ').slice(0, 200)}`,
        severity: 'minor',
        recommendation: 'Investigate and resolve console errors.',
      });
    }
  }

  // From clickflows
  for (const cf of clickflows) {
    for (const de of cf.deadEnds) {
      issues.push({
        page: cf.route,
        viewport: cf.viewport,
        element: `"${de}"`,
        problem: 'Dead end — clicking this element produces no visible effect',
        severity: 'major',
        recommendation: 'Either make the button functional or remove it.',
      });
    }
    for (const noop of cf.noOpButtons) {
      issues.push({
        page: cf.route,
        viewport: cf.viewport,
        element: `button "${noop}"`,
        problem: 'Button appears clickable but does nothing',
        severity: 'major',
        recommendation: 'Add a click handler or style as non-interactive.',
      });
    }
    for (const dup of cf.duplicateCTAs) {
      if (dup.count > 2) {
        issues.push({
          page: cf.route,
          viewport: cf.viewport,
          element: `"${dup.text}" (×${dup.count})`,
          problem: `Duplicate CTA appears ${dup.count} times — confusing`,
          severity: 'minor',
          recommendation: 'Consolidate duplicate calls-to-action.',
        });
      }
    }
  }

  // From LLM evaluations
  for (const ev of evaluations) {
    if (ev.passFail === 'FAIL') {
      issues.push({
        page: ev.route,
        viewport: ev.viewport,
        element: 'overall page',
        problem: `LLM evaluator FAILED this page: ${ev.summary.slice(0, 200)}`,
        severity: 'major',
        recommendation: ev.shouldEmphasize.join('; ') || 'Review LLM feedback.',
      });
    }
    for (const ct of ev.confusingText) {
      issues.push({
        page: ev.route,
        viewport: ev.viewport,
        element: `text: "${ct}"`,
        problem: 'Confusing text identified by first-time user evaluator',
        severity: 'minor',
        recommendation: 'Simplify or provide context.',
      });
    }
    for (const tb of ev.trustBreakers) {
      issues.push({
        page: ev.route,
        viewport: ev.viewport,
        element: tb,
        problem: 'Trust-breaking element — may prevent user from connecting data',
        severity: 'major',
        recommendation: 'Address trust concern or add reassurance.',
      });
    }
  }

  // Sort by severity
  const severityOrder = { critical: 0, major: 1, minor: 2 };
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return issues;
}

// ── Part 4: Report generation ────────────────────────────────────────────────

function generateReport(
  results: AuditResult[],
  clickflows: ClickflowReport[],
  evaluations: LLMEvaluation[],
  heuristics: HeuristicScore[],
  issues: UXIssue[],
) {
  const lines: string[] = [];
  const now = new Date().toISOString().split('T')[0];

  lines.push(`# Foldera UX Audit Report`);
  lines.push(`Generated: ${now}\n`);

  // ── Ship Risk Summary
  const critical = issues.filter(i => i.severity === 'critical').length;
  const major = issues.filter(i => i.severity === 'major').length;
  const minor = issues.filter(i => i.severity === 'minor').length;
  const passCount = results.filter(r => r.passed).length;
  const failCount = results.filter(r => !r.passed).length;

  lines.push(`## Ship Risk Summary\n`);
  lines.push(`| Severity | Count |`);
  lines.push(`|----------|-------|`);
  lines.push(`| Critical | ${critical} |`);
  lines.push(`| Major | ${major} |`);
  lines.push(`| Minor | ${minor} |`);
  lines.push(`\n**Verdict:** ${critical > 0 ? 'NOT READY TO SHIP' : major > 3 ? 'SHIP WITH CAUTION' : 'SHIP READY'}\n`);

  // ── Pass/Fail Summary
  lines.push(`## Pass/Fail Summary\n`);
  lines.push(`| Route | Viewport | Passed | Screenshot |`);
  lines.push(`|-------|----------|--------|------------|`);
  for (const r of results) {
    lines.push(`| ${r.route} | ${r.viewport} | ${r.passed ? '✅' : '❌'} | ${r.screenshotFile} |`);
  }
  lines.push('');

  // ── Per-Route Results
  lines.push(`## Per-Route Results\n`);
  for (const r of results) {
    lines.push(`### ${r.route} — ${r.viewport} (${r.viewportWidth}px)${r.authenticated ? ' [authenticated]' : ''}\n`);
    lines.push(`- **Title:** ${r.title}`);
    lines.push(`- **Blank screen:** ${r.notBlank ? 'No' : 'YES — BLANK'}`);
    lines.push(`- **Primary CTA:** ${r.primaryCTA ? `"${r.primaryCTA.text}" (${r.primaryCTA.tag})` : 'NONE FOUND'}`);
    lines.push(`- **Visible text length:** ${r.visibleTextLength} chars`);
    lines.push(`- **Interactive elements:** ${r.visibleElements} visible / ${r.totalElements} total`);
    lines.push(`- **Horizontal overflow:** ${r.hasOverflow ? `YES (${r.scrollWidth}px)` : 'No'}`);
    lines.push(`- **Console errors:** ${r.consoleErrors.length === 0 ? 'None' : r.consoleErrors.join('; ')}`);
    lines.push(`- **Page errors:** ${r.pageErrors.length === 0 ? 'None' : r.pageErrors.join('; ')}`);
    lines.push(`- **Screenshot:** \`${r.screenshotFile}\``);
    lines.push('');
  }

  // ── Clickflow Results
  lines.push(`## Clickflow Analysis\n`);
  for (const cf of clickflows) {
    lines.push(`### ${cf.route} (${cf.viewport})\n`);
    lines.push(`- **Interactive elements:** ${cf.totalInteractive}`);
    lines.push(`- **Dead ends:** ${cf.deadEnds.length === 0 ? 'None' : cf.deadEnds.map(d => `"${d}"`).join(', ')}`);
    lines.push(`- **No-op buttons:** ${cf.noOpButtons.length === 0 ? 'None' : cf.noOpButtons.map(n => `"${n}"`).join(', ')}`);
    lines.push(`- **Duplicate CTAs:** ${cf.duplicateCTAs.length === 0 ? 'None' : cf.duplicateCTAs.map(d => `"${d.text}" ×${d.count}`).join(', ')}`);

    if (cf.clickResults.length > 0) {
      lines.push(`\n| Element | Action | Result |`);
      lines.push(`|---------|--------|--------|`);
      for (const cr of cf.clickResults) {
        lines.push(`| "${cr.element.text.slice(0, 40)}" | ${cr.action} | ${cr.deadEnd ? '⚠️ Dead end' : cr.errorAppeared ? '❌ Error' : '✅'} |`);
      }
    }
    lines.push('');
  }

  // ── Heuristic Scores
  lines.push(`## Usability Heuristic Scores\n`);
  lines.push(`| Route | Viewport | Clarity | Next Step | Cog Load | Trust | Hierarchy | No Mislead | No Lost | **Avg** |`);
  lines.push(`|-------|----------|---------|-----------|----------|-------|-----------|------------|---------|---------|`);
  for (const h of heuristics) {
    lines.push(`| ${h.route} | ${h.viewport} | ${h.clarity5sec} | ${h.oneObviousStep} | ${h.lowCognitiveLoad} | ${h.trustBeforeData} | ${h.visualHierarchy} | ${h.noMisleadingUI} | ${h.noWhatDoIDo} | **${h.total}** |`);
  }
  lines.push('');

  // ── LLM Evaluations
  if (evaluations.length > 0) {
    lines.push(`## LLM UX Evaluator Results\n`);
    for (const ev of evaluations) {
      lines.push(`### ${ev.route} — ${ev.viewport}\n`);
      lines.push(`- **Verdict:** ${ev.passFail}`);
      lines.push(`- **Clarity (5s):** ${ev.scores.clarity_5sec}/10`);
      lines.push(`- **Next action obvious:** ${ev.scores.next_action_obvious}/10`);
      lines.push(`- **Confusion level:** ${ev.scores.confusion_level}/10`);
      lines.push(`- **Trust level:** ${ev.scores.trust_level}/10`);
      lines.push(`- **Context understanding:** ${ev.scores.context_understanding}/10`);
      lines.push(`- **Summary:** ${ev.summary}`);
      if (ev.confusingText.length) lines.push(`- **Confusing text:** ${ev.confusingText.map(t => `"${t}"`).join(', ')}`);
      if (ev.trustBreakers.length) lines.push(`- **Trust breakers:** ${ev.trustBreakers.join(', ')}`);
      if (ev.shouldEmphasize.length) lines.push(`- **Should emphasize:** ${ev.shouldEmphasize.join(', ')}`);
      if (ev.shouldRemove.length) lines.push(`- **Should remove:** ${ev.shouldRemove.join(', ')}`);
      lines.push('');
    }
  } else {
    lines.push(`## LLM UX Evaluator Results\n`);
    lines.push(`_Skipped — ANTHROPIC_API_KEY not set. Run with API key to enable LLM evaluation._\n`);
  }

  // ── Top Issues
  lines.push(`## Top 10 UX Issues\n`);
  const uxIssues = issues.filter(i => ['critical', 'major'].includes(i.severity) || i.problem.includes('confusing') || i.problem.includes('trust'));
  for (let i = 0; i < Math.min(10, uxIssues.length); i++) {
    const issue = uxIssues[i];
    lines.push(`${i + 1}. **[${issue.severity.toUpperCase()}]** ${issue.page} (${issue.viewport}) — ${issue.element}`);
    lines.push(`   - Problem: ${issue.problem}`);
    lines.push(`   - Fix: ${issue.recommendation}`);
    lines.push('');
  }

  lines.push(`## Top 10 Logic/Flow Issues\n`);
  const flowIssues = issues.filter(i => i.problem.includes('Dead end') || i.problem.includes('no-op') || i.problem.includes('no obvious') || i.problem.includes('does nothing'));
  for (let i = 0; i < Math.min(10, flowIssues.length); i++) {
    const issue = flowIssues[i];
    lines.push(`${i + 1}. **[${issue.severity.toUpperCase()}]** ${issue.page} (${issue.viewport}) — ${issue.element}`);
    lines.push(`   - Problem: ${issue.problem}`);
    lines.push(`   - Fix: ${issue.recommendation}`);
    lines.push('');
  }

  // ── All Issues
  lines.push(`## All Issues (${issues.length} total)\n`);
  lines.push(`| # | Severity | Page | Viewport | Element | Problem |`);
  lines.push(`|---|----------|------|----------|---------|---------|`);
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    lines.push(`| ${i + 1} | ${issue.severity} | ${issue.page} | ${issue.viewport} | ${issue.element.slice(0, 30)} | ${issue.problem.slice(0, 60)} |`);
  }
  lines.push('');

  return lines.join('\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[ux-audit] Loading audit data from audit-output/...');

  // Load Playwright smoke results
  const results = loadJsonFiles<AuditResult>('results');
  console.log(`[ux-audit] Loaded ${results.length} smoke audit results`);

  if (results.length === 0) {
    console.error('[ux-audit] No audit results found. Run `npm run audit:smoke` first.');
    process.exit(1);
  }

  // Load clickflow data
  const clickflows = loadJsonFiles<ClickflowReport>('clickflow');
  console.log(`[ux-audit] Loaded ${clickflows.length} clickflow reports`);

  // Part 5: Score heuristics
  console.log('[ux-audit] Scoring usability heuristics...');
  const heuristics: HeuristicScore[] = [];
  for (const r of results) {
    const textFile = `${(r.route.replace(/\//g, '_').replace(/^_/, '') || 'root')}--${r.viewport}.txt`;
    const elemFile = `${(r.route.replace(/\//g, '_').replace(/^_/, '') || 'root')}--${r.viewport}.json`;
    const visibleText = loadTextFile('snapshots', textFile);
    let elements: any[] = [];
    try {
      const raw = loadTextFile('elements', elemFile);
      if (raw) elements = JSON.parse(raw);
    } catch { /* ignore */ }

    heuristics.push(scoreHeuristics(r, visibleText, elements));
  }

  // Part 3: LLM evaluation
  const evaluations: LLMEvaluation[] = [];
  if (process.env.ANTHROPIC_API_KEY) {
    console.log('[ux-audit] Running LLM evaluator (this may take a minute)...');
    for (const r of results) {
      const prefix = r.route.replace(/\//g, '_').replace(/^_/, '') || 'root';
      const textFile = `${prefix}--${r.viewport}.txt`;
      const elemFile = `${prefix}--${r.viewport}.json`;
      const screenshotPath = path.join(OUTPUT_DIR, 'screenshots', `${prefix}--${r.viewport}.png`);

      const visibleText = loadTextFile('snapshots', textFile);
      let elements: any[] = [];
      try {
        const raw = loadTextFile('elements', elemFile);
        if (raw) elements = JSON.parse(raw);
      } catch { /* ignore */ }

      const evaluation = await evaluateWithLLM(r.route, r.viewport, visibleText, elements, screenshotPath);
      if (evaluation) {
        evaluations.push(evaluation);
        console.log(`  [${evaluation.passFail}] ${r.route} @ ${r.viewport}`);
      }
    }
    console.log(`[ux-audit] LLM evaluated ${evaluations.length} pages`);
  } else {
    console.log('[ux-audit] ANTHROPIC_API_KEY not set — skipping LLM evaluation');
  }

  // Extract issues
  console.log('[ux-audit] Extracting issues...');
  const issues = extractIssues(results, clickflows, evaluations);
  console.log(`[ux-audit] Found ${issues.length} issues (${issues.filter(i => i.severity === 'critical').length} critical, ${issues.filter(i => i.severity === 'major').length} major, ${issues.filter(i => i.severity === 'minor').length} minor)`);

  // Part 4: Generate report
  console.log('[ux-audit] Generating report...');
  const report = generateReport(results, clickflows, evaluations, heuristics, issues);
  fs.writeFileSync(REPORT_PATH, report, 'utf-8');
  console.log(`[ux-audit] Report written to ${REPORT_PATH}`);

  // Print summary
  const critical = issues.filter(i => i.severity === 'critical').length;
  const major = issues.filter(i => i.severity === 'major').length;
  console.log(`\n=== AUDIT COMPLETE ===`);
  console.log(`Pages audited: ${results.length}`);
  console.log(`Critical: ${critical} | Major: ${major} | Minor: ${issues.filter(i => i.severity === 'minor').length}`);
  console.log(`Verdict: ${critical > 0 ? 'NOT READY TO SHIP' : major > 3 ? 'SHIP WITH CAUTION' : 'SHIP READY'}`);
}

main().catch((err) => {
  console.error('[ux-audit] Fatal error:', err);
  process.exit(1);
});
