/**
 * Native web search for the Scout lane (issue #486, Stage 2).
 *
 * Replaces the recalled-from-memory "enrichment" (which asked the model to
 * recall facts it cannot actually look up) with REAL web access via the
 * Anthropic server-side web_search tool. Anthropic runs the searches on its
 * own infrastructure and returns results inline; we read the model's
 * synthesized, source-cited summary.
 *
 * The researcher runs on Haiku 4.5, so we use the basic `web_search_20250305`
 * tool variant — the dynamic-filtering `web_search_20260209` variant requires
 * Sonnet 4.6+. Server-side web search can pause (`stop_reason: "pause_turn"`)
 * when it hits its internal iteration limit; we resume by re-sending the
 * accumulated turn, bounded by MAX_PAUSE_CONTINUATIONS.
 *
 * Gated by SCOUT_WEB_ENABLED *and* isPaidLlmAllowed(): both must hold or this
 * no-ops (returns null), so the brief path is unchanged when the lane is off.
 * The ANTHROPIC_API_KEY is read only inside the call, never at module top level.
 */

import Anthropic from '@anthropic-ai/sdk';
import { isScoutWebEnabled } from '@/lib/config/prelaunch-spend';
import { isPaidLlmAllowed } from '@/lib/llm/paid-llm-gate';
import { trackApiCall } from '@/lib/utils/api-tracker';

export const WEB_SEARCH_MODEL = 'claude-haiku-4-5-20251001';
const WEB_SEARCH_MAX_USES = 3;
const WEB_SEARCH_MAX_TOKENS = 600;
const MAX_PAUSE_CONTINUATIONS = 3;
/** Model returns this exact token when no reliable public fact is found. */
const NO_RESULT_TOKEN = 'NONE';

const WEB_SEARCH_SYSTEM_PROMPT =
  'You are a research assistant with live web access. Find current, verifiable public facts that are directly relevant to the situation described and report them concisely, naming the source for each fact. Prefer official or authoritative sources. Do not speculate. If you cannot find anything relevant and reliable, reply with exactly NONE and nothing else.';

let anthropicClient: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropicClient;
}

const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20250305 = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: WEB_SEARCH_MAX_USES,
};

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

/**
 * Run a real web search for public context relevant to `query`. Returns the
 * model's synthesized, source-cited summary, or null when the lane is off, the
 * query is empty, the search fails, or nothing reliable is found.
 */
export async function searchWebForEnrichment(
  query: string,
  userId?: string | null,
): Promise<string | null> {
  if (!isScoutWebEnabled() || !isPaidLlmAllowed()) return null;

  const trimmed = query.trim();
  if (!trimmed) return null;

  try {
    const client = getAnthropic();
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: trimmed }];

    let finalText = '';
    for (let attempt = 0; attempt <= MAX_PAUSE_CONTINUATIONS; attempt++) {
      const response = await client.messages.create({
        model: WEB_SEARCH_MODEL,
        max_tokens: WEB_SEARCH_MAX_TOKENS,
        system: WEB_SEARCH_SYSTEM_PROMPT,
        messages,
        tools: [WEB_SEARCH_TOOL],
      });

      await trackApiCall({
        userId: userId ?? null,
        model: WEB_SEARCH_MODEL,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        callType: 'scout_web_search',
      }).catch(() => undefined);

      finalText = extractText(response.content);

      // Server-side search paused at its iteration limit — resume the same turn.
      if (response.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: response.content });
        continue;
      }
      break;
    }

    if (!finalText || finalText.toUpperCase() === NO_RESULT_TOKEN) return null;
    return finalText;
  } catch {
    // Web search failure is non-fatal — the brief still has the internal synthesis.
    return null;
  }
}
