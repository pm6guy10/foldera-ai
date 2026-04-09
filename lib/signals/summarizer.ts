/**
 * Signal summarizer — compresses old signals into weekly digests.
 *
 * Called by ttl-cleanup before deleting signals older than 90 days.
 * Summaries persist permanently and feed into the generator as long-term context.
 *
 * Each summary captures: signal count, sources, themes, people, emotional tone,
 * and a human-readable digest like:
 *   "Week of March 10: 14 emails about MAS3, 3 about Foldera, 2 about ESD.
 *    Dominant theme: waiting. Emotional tone: anxious."
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/db/client';
import { decryptWithStatus } from '@/lib/encryption';
import { isPaidLlmAllowed } from '@/lib/llm/paid-llm-gate';
import { trackApiCall } from '@/lib/utils/api-tracker';
import { logStructuredEvent } from '@/lib/utils/structured-logger';

let _anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

interface WeekBucket {
  weekStart: string; // ISO date (Monday)
  weekEnd: string;   // ISO date (Sunday)
  signals: Array<{ source: string; content: string; author: string | null; occurred_at: string }>;
}

/**
 * Summarize all unsummarized signal weeks for a user.
 * Only summarizes complete weeks (week_end < today).
 * Returns the number of new summaries created.
 */
export async function summarizeSignals(
  userId: string,
  opts?: { skipAnthropic?: boolean },
): Promise<number> {
  if (opts?.skipAnthropic) {
    return 0;
  }

  if (!isPaidLlmAllowed()) {
    return 0;
  }

  const supabase = createServerClient();

  // Find the oldest unsummarized signal week.
  // We only summarize weeks that are fully complete (ended before today).
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get all signals for this user older than 7 days (recent signals don't need summarizing yet)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: signals, error } = await supabase
    .from('tkg_signals')
    .select('id, source, content, author, occurred_at, created_at')
    .eq('user_id', userId)
    .lt('created_at', sevenDaysAgo)
    .order('occurred_at', { ascending: true })
    .limit(500);

  if (error || !signals || signals.length === 0) {
    return 0;
  }

  // Check which weeks already have summaries
  const { data: existingSummaries, error: existingSummariesError } = await supabase
    .from('signal_summaries')
    .select('week_start')
    .eq('user_id', userId);

  if (existingSummariesError) {
    logStructuredEvent({
      event: 'summary_lookup_failed',
      level: 'warn',
      userId,
      artifactType: null,
      generationStatus: 'summary_lookup_failed',
      details: {
        scope: 'summarizer',
        error: existingSummariesError.message,
      },
    });
    return 0;
  }

  const summarizedWeeks = new Set(
    (existingSummaries ?? []).map((s: any) => s.week_start)
  );

  // Bucket signals by week (Monday-Sunday)
  const buckets = new Map<string, WeekBucket>();

  let skippedDecryptRows = 0;

  for (const signal of signals) {
    const date = new Date(signal.occurred_at ?? signal.created_at);
    const monday = getMonday(date);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    // Skip if week isn't complete yet
    if (sunday >= today) continue;

    const weekKey = monday.toISOString().slice(0, 10);

    // Skip if already summarized
    if (summarizedWeeks.has(weekKey)) continue;

    if (!buckets.has(weekKey)) {
      buckets.set(weekKey, {
        weekStart: weekKey,
        weekEnd: sunday.toISOString().slice(0, 10),
        signals: [],
      });
    }

    const decrypted = decryptWithStatus(signal.content ?? '');
    if (decrypted.usedFallback) {
      skippedDecryptRows++;
      continue;
    }
    buckets.get(weekKey)!.signals.push({
      source: signal.source ?? 'unknown',
      content: decrypted.plaintext.slice(0, 500), // Trim for token efficiency
      author: signal.author ?? null,
      occurred_at: signal.occurred_at ?? signal.created_at,
    });
  }

  if (skippedDecryptRows > 0) {
    logStructuredEvent({
      event: 'signal_skip',
      level: 'warn',
      userId,
      artifactType: null,
      generationStatus: 'decrypt_skip',
      details: {
        scope: 'summarizer',
        skipped_rows: skippedDecryptRows,
      },
    });
  }

  if (buckets.size === 0) return 0;

  // Summarize each week
  let created = 0;

  for (const [, bucket] of buckets) {
    try {
      const summary = await compressWeek(userId, bucket);
      if (summary) {
        const { error: insertError } = await supabase
          .from('signal_summaries')
          .upsert(
            {
              user_id: userId,
              week_start: bucket.weekStart,
              week_end: bucket.weekEnd,
              signal_count: bucket.signals.length,
              sources: countSources(bucket.signals),
              themes: summary.themes,
              people: summary.people,
              summary: summary.text,
              emotional_tone: summary.tone,
            },
            { onConflict: 'user_id,week_start' }
          );

        if (!insertError) {
          created++;
        } else {
          logStructuredEvent({
            event: 'summary_persist_failed',
            level: 'warn',
            userId,
            artifactType: null,
            generationStatus: 'summary_persist_failed',
            details: {
              scope: 'summarizer',
              week_start: bucket.weekStart,
              error: insertError.message,
            },
          });
        }
      }
    } catch (err: any) {
      logStructuredEvent({
        event: 'summary_generation_failed',
        level: 'warn',
        userId,
        artifactType: null,
        generationStatus: 'summary_generation_failed',
        details: {
          scope: 'summarizer',
          week_start: bucket.weekStart,
          error: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  logStructuredEvent({
    event: 'summary_complete',
    userId,
    artifactType: null,
    generationStatus: 'summary_complete',
    details: {
      scope: 'summarizer',
      summaries_created: created,
    },
  });
  return created;
}

// ---------------------------------------------------------------------------
// Compress one week of signals using Haiku
// ---------------------------------------------------------------------------

interface WeekSummary {
  text: string;
  themes: string[];
  people: string[];
  tone: string;
}

async function compressWeek(userId: string, bucket: WeekBucket): Promise<WeekSummary | null> {
  const signalBlock = bucket.signals
    .map((s, i) => `[${i + 1}] (${s.source}) ${s.author ? `from ${s.author}: ` : ''}${s.content}`)
    .join('\n');

  const MODEL = 'claude-haiku-4-5-20251001';

  try {
    const response = await getAnthropic().messages.create({
      model: MODEL,
      max_tokens: 400,
      temperature: 0,
      system: `You compress raw signals into a weekly digest. Be specific — use real names, topics, and counts. Output JSON only.`,
      messages: [
        {
          role: 'user',
          content: `Summarize these ${bucket.signals.length} signals from the week of ${bucket.weekStart}:

${signalBlock}

Output JSON:
{
  "text": "Week of [date]: [count] emails about [topic], [count] about [topic]. Dominant theme: [theme]. Emotional tone: [tone].",
  "themes": ["topic1", "topic2"],
  "people": ["Person Name", "Person Name"],
  "tone": "one word: anxious | confident | neutral | urgent | frustrated | optimistic | mixed"
}`,
        },
      ],
    });

    await trackApiCall({
      userId,
      model: MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      callType: 'signal_summary',
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '';
    const cleaned = raw.replace(/```(?:json|JSON)?\s*\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      text: parsed.text ?? '',
      themes: Array.isArray(parsed.themes) ? parsed.themes : [],
      people: Array.isArray(parsed.people) ? parsed.people : [],
      tone: parsed.tone ?? 'neutral',
    };
  } catch (err: any) {
    logStructuredEvent({
      event: 'summary_model_failed',
      level: 'warn',
      userId,
      artifactType: null,
      generationStatus: 'summary_model_failed',
      details: {
        scope: 'summarizer',
        error: err instanceof Error ? err.message : String(err),
      },
    });
    // Fallback: deterministic summary without LLM
    return buildFallbackSummary(bucket);
  }
}

// ---------------------------------------------------------------------------
// Fallback summary (no LLM needed)
// ---------------------------------------------------------------------------

function buildFallbackSummary(bucket: WeekBucket): WeekSummary {
  const sources = countSources(bucket.signals);
  const sourceStr = Object.entries(sources)
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .map(([src, count]) => `${count} from ${src}`)
    .join(', ');

  const people = extractPeople(bucket.signals);

  return {
    text: `Week of ${bucket.weekStart}: ${bucket.signals.length} signals (${sourceStr}).${people.length > 0 ? ` Key people: ${people.slice(0, 5).join(', ')}.` : ''}`,
    themes: [],
    people,
    tone: 'neutral',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function countSources(signals: Array<{ source: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of signals) {
    counts[s.source] = (counts[s.source] ?? 0) + 1;
  }
  return counts;
}

function extractPeople(signals: Array<{ author: string | null }>): string[] {
  const people = new Set<string>();
  for (const s of signals) {
    if (s.author && s.author.length > 1) {
      people.add(s.author);
    }
  }
  return Array.from(people).slice(0, 10);
}
