/**
 * Proactive Scout loop (issue #486, Stage 3).
 *
 * The presence-layer pipeline is REACTIVE: it waits for an inbox/calendar signal
 * and proposes one finished action. The Scout loop is PROACTIVE but INWARD: it
 * watches the user's OWN world — the commitments they made, the replies they owe,
 * the deadlines and filings sitting in their own files — and, when one of those is
 * about to slip, produces a finished, review-gated artifact the user could use
 * immediately (a ready-to-send reply, a short decision memo, a completed form) to
 * handle it. It does NOT fish the open web for external opportunities (jobs,
 * grants, RFPs, people to pitch) — that is outside-in and tone-deaf (issue #492).
 *
 * Pipeline per goal:
 *   infer goal (tkg_goals)
 *     → real web search   (Stage 2: searchWebForEnrichment, self-gated)
 *     → Drive materials   (Stage 1: retrieveDriveContext, self-gated)
 *     → writer            (Sonnet 4.6) grounds a finished artifact in both
 *
 * Doctrine (ACTIVE_HANDOFF.md / Bible Part V):
 * - Additive and flag-gated: the whole loop no-ops when SCOUT_ENABLED is off, so
 *   the Workday Presence Layer is the unchanged default.
 * - Safe silence beats a fake card: with no real web/Drive context, or when the
 *   writer judges nothing worth surfacing, we return nothing — no paid writer
 *   call is even made on empty context.
 * - Never auto-sends: the loop only RETURNS proposals. Delivery for review is
 *   Stage 4. Nothing here mutates state or sends a message.
 *
 * The ANTHROPIC_API_KEY is read only inside the call, never at module top level.
 */

import Anthropic from '@anthropic-ai/sdk';

import { createServerClient } from '@/lib/db/client';
import { isScoutEnabled } from '@/lib/config/prelaunch-spend';
import { isPaidLlmAllowed } from '@/lib/llm/paid-llm-gate';
import { retrieveDriveContext } from '@/lib/scout/retrieval';
import { searchWebForEnrichment } from '@/lib/scout/web-search';
import { trackApiCall } from '@/lib/utils/api-tracker';

// The scout reasoning/writer runs on Sonnet 4.6 (issue #486 model split: Haiku
// 4.5 for bulk extraction/recall, Sonnet 4.6 for the proactive scout loop).
export const SCOUT_LOOP_MODEL = 'claude-sonnet-4-6';
const SCOUT_WRITER_MAX_TOKENS = 1500;
/** Goals scouted per loop invocation — keep small to bound cost and stay focused. */
export const DEFAULT_MAX_SCOUT_GOALS = 1;
/** Drive chunks pulled to ground one artifact. */
const SCOUT_DRIVE_K = 6;
/** Below this model-reported confidence we stay silent rather than surface a weak card. */
export const SCOUT_MIN_CONFIDENCE = 60;

/**
 * Guard against internal-systems leakage in generated copy — same intent as the
 * researcher's system-introspection filter. A proposal that talks about pipelines
 * or Foldera internals is never user-facing.
 */
const SYSTEM_INTROSPECTION_RE =
  /\b(tkg_signals?|tkg_actions?|orchestrator|data\s*pipeline|sync\s*(?:health|error|failure|status)|foldera\s*(?:system|health|error|log|directive|infrastructure)|decrypt\s*(?:fail|error)|cron\s*(?:job|run|fail)|api\s*(?:usage|spend|rate\s*limit))\b/i;

const SCOUT_WRITER_SYSTEM_PROMPT =
  "You are a quiet guardian working for one person. Your only job is to reduce their mental load by watching THEIR OWN world — the commitments they have already made, the replies they owe, the deadlines and filings sitting in their own files and threads — and to catch the one thing they are about to drop. You are given their own stated goal or obligation, material drawn from their own files, and (only where it helps) verified public facts that clarify a requirement, deadline, or next step for something they ALREADY need to handle. You do NOT go looking for new external opportunities to send them on: no job openings, no grants, no RFPs, no funding to chase, no people to pitch. That is not your job and it is tone-deaf. Find the single highest-consequence thing in THEIR OWN world that is time-sensitive and would cost them if it slipped, and produce ONE finished artifact they could use immediately to handle it (a ready-to-send reply, a short decision memo, a completed form or filing), grounded only in their files and the verified facts provided. Never invent facts, employers, names, numbers, deadlines, credentials, or experience that are not present in the provided context — if their files do not support a claim, do not make it. If nothing in their own world clears the bar right now, say so plainly: silence is far better than a manufactured or outward-looking suggestion. You only propose finished work for their review — you never send anything. Do not mention internal systems, data pipelines, or how this information was gathered.";

export interface ScoutGoal {
  text: string;
  category: string;
  priority: number;
}

export interface ScoutDriveSource {
  fileName: string | null;
  webViewLink: string | null;
}

/**
 * A finished, review-gated proposal produced by the scout loop. This is data
 * only — the caller (Stage 4 delivery) decides how to surface it for review.
 * Nothing here is ever auto-sent.
 */
export interface ScoutArtifactProposal {
  goal: ScoutGoal;
  /** One-line description of the thing in the person's own world about to need attention. */
  headline: string;
  /** Why this matters now — the deadline, decay, or window. */
  rationale: string;
  /** Title of the finished artifact. */
  artifactTitle: string;
  /** The finished, review-gated artifact body (e.g. a ready-to-send reply or completed form). */
  artifactBody: string;
  /** Model-reported confidence, 0-100. */
  confidence: number;
  /** Verified public facts used to act on the person's own obligation, or null. */
  webContext: string | null;
  /** Drive files that grounded the artifact. */
  driveSources: ScoutDriveSource[];
}

export interface RunScoutLoopOptions {
  /** Cap on goals scouted this invocation. */
  maxGoals?: number;
  /** Scout this exact goal instead of loading from tkg_goals (targeted / testing). */
  goal?: ScoutGoal;
}

interface ScoutWriterResult {
  worth_surfacing?: boolean;
  headline?: string;
  rationale?: string | null;
  artifact_title?: string;
  artifact_body?: string;
  confidence?: number;
}

let anthropicClient: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

/**
 * Load the user's active goals from tkg_goals, highest priority first. Returns []
 * on any error so the loop degrades to safe silence rather than throwing.
 */
export async function loadScoutGoals(
  userId: string,
  limit = 5,
): Promise<ScoutGoal[]> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('tkg_goals')
      .select('goal_text, goal_category, priority')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('priority', { ascending: true })
      .limit(Math.max(1, limit));

    if (error || !data) return [];

    return (data as Array<{ goal_text: string | null; goal_category: string | null; priority: number | null }>)
      .filter((row) => typeof row.goal_text === 'string' && row.goal_text.trim().length > 0)
      .map((row) => ({
        text: row.goal_text!.trim(),
        category: row.goal_category?.trim() || 'general',
        priority: typeof row.priority === 'number' ? row.priority : 99,
      }));
  } catch {
    return [];
  }
}

/**
 * Build the web query. INWARD: the web is used only to verify concrete facts the
 * person needs to act on something that is ALREADY theirs to handle — never to
 * discover new external opportunities to send them on (issue #492).
 */
function buildScoutWebQuery(goal: ScoutGoal): string {
  return `A person needs to handle this in their own world: "${goal.text}" (domain: ${goal.category}). Find only the concrete public facts that help them complete or protect THIS specific obligation — the real requirements, official deadline, form, contact, or procedure for the thing they already need to do — and report each detail with its source. Do not look for new opportunities, job openings, grants, RFPs, or things to pitch; only verify the facts they need to act on what is already theirs.`;
}

/** Flatten retrieved Drive chunks into a bounded, labelled context block. */
function formatDriveBlock(
  chunks: Awaited<ReturnType<typeof retrieveDriveContext>>,
): string | null {
  if (chunks.length === 0) return null;
  return chunks
    .map((chunk) => {
      const label = chunk.fileName?.trim() || 'Drive document';
      return `From "${label}": ${chunk.content.trim()}`;
    })
    .join('\n\n')
    .slice(0, 4000);
}

function buildScoutWriterPrompt(
  goal: ScoutGoal,
  webContext: string | null,
  driveBlock: string | null,
): string {
  return `THEIR OWN GOAL / OBLIGATION: ${goal.text}
DOMAIN: ${goal.category}

VERIFIED PUBLIC FACTS (only for acting on what is already theirs):
${webContext ?? 'None found.'}

MATERIAL FROM THE PERSON'S OWN FILES:
${driveBlock ?? 'None retrieved.'}

Using only their goal/obligation, the verified facts, and their own files above, decide whether there is a single thing in THIS PERSON'S OWN WORLD that is time-sensitive and about to slip — something they have already taken on, not a new external opportunity. If so, write the finished artifact they could use immediately to handle it.

Return strict JSON only:
{
  "worth_surfacing": true or false,
  "headline": "One line naming the thing in their own world that is about to need attention",
  "rationale": "Why this matters now — the stakes, deadline, or window. One or two sentences.",
  "artifact_title": "A short title for the finished artifact",
  "artifact_body": "The complete, ready-to-use artifact (reply, memo, form, or filing), grounded only in the verified facts and their files — invent nothing",
  "confidence": 0-100
}

If nothing in their own world clears the bar, return exactly:
{"worth_surfacing": false}`;
}

function parseWriterJson(raw: string): ScoutWriterResult | null {
  try {
    const cleaned = raw.replace(/```(?:json|JSON)?\s*\n?/g, '').trim();
    return JSON.parse(cleaned) as ScoutWriterResult;
  } catch {
    return null;
  }
}

/**
 * Scout one goal: gather real web + Drive context, then (only if there is context
 * to ground on) ask the writer for a finished artifact. Returns a proposal, or
 * null for safe silence (no context, parse failure, low confidence, or the writer
 * judging nothing worth surfacing). No paid writer call is made on empty context.
 */
async function scoutGoal(userId: string, goal: ScoutGoal): Promise<ScoutArtifactProposal | null> {
  // Stage 2 web search + Stage 1 Drive RAG. Each self-gates and returns the empty
  // value (null / []) when its lane is off, so this composes without extra checks.
  const [webContext, driveChunks] = await Promise.all([
    searchWebForEnrichment(buildScoutWebQuery(goal), userId).catch(() => null),
    retrieveDriveContext(userId, goal.text, SCOUT_DRIVE_K).catch(() => []),
  ]);

  const driveBlock = formatDriveBlock(driveChunks);

  // Safe silence: with neither real web context nor Drive material there is
  // nothing to ground a finished artifact on. Skip before spending on the writer.
  if (!webContext && !driveBlock) return null;

  const response = await getAnthropic().messages.create({
    model: SCOUT_LOOP_MODEL,
    max_tokens: SCOUT_WRITER_MAX_TOKENS,
    temperature: 0.2,
    system: SCOUT_WRITER_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildScoutWriterPrompt(goal, webContext, driveBlock) }],
  });

  await trackApiCall({
    userId,
    model: SCOUT_LOOP_MODEL,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    callType: 'scout_loop_writer',
  }).catch(() => undefined);

  const parsed = parseWriterJson(extractText(response.content));
  if (!parsed || parsed.worth_surfacing !== true) return null;

  const headline = (parsed.headline ?? '').trim();
  const artifactTitle = (parsed.artifact_title ?? '').trim();
  const artifactBody = (parsed.artifact_body ?? '').trim();
  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;

  // A surfaced proposal must be a finished artifact with real conviction behind it.
  if (!headline || !artifactBody || confidence < SCOUT_MIN_CONFIDENCE) return null;

  // Never leak internal-systems copy into a user-facing artifact.
  if (SYSTEM_INTROSPECTION_RE.test(headline) || SYSTEM_INTROSPECTION_RE.test(artifactBody)) {
    return null;
  }

  return {
    goal,
    headline,
    rationale: (parsed.rationale ?? '').trim() || 'Time-sensitive obligation in your own world about to slip.',
    artifactTitle: artifactTitle || headline,
    artifactBody,
    confidence,
    webContext,
    driveSources: driveChunks.map((chunk) => ({
      fileName: chunk.fileName,
      webViewLink: chunk.webViewLink,
    })),
  };
}

/**
 * Run the proactive scout loop for a user. Returns finished, review-gated artifact
 * proposals — never sends anything. Returns [] (fully inert, no paid calls) when
 * the Scout lane is off or paid LLM is not allowed, so default behavior is unchanged.
 */
export async function runScoutLoop(
  userId: string,
  options: RunScoutLoopOptions = {},
): Promise<ScoutArtifactProposal[]> {
  if (!isScoutEnabled() || !isPaidLlmAllowed()) return [];

  const maxGoals = Math.max(1, options.maxGoals ?? DEFAULT_MAX_SCOUT_GOALS);
  const goals = options.goal ? [options.goal] : (await loadScoutGoals(userId, maxGoals)).slice(0, maxGoals);
  if (goals.length === 0) return [];

  const proposals: ScoutArtifactProposal[] = [];
  for (const goal of goals) {
    try {
      const proposal = await scoutGoal(userId, goal);
      if (proposal) proposals.push(proposal);
    } catch (err) {
      // One goal failing must not sink the loop — stay silent on it and continue.
      console.warn('[scout-loop] goal scouting failed:', err instanceof Error ? err.message : String(err));
    }
  }

  return proposals;
}
