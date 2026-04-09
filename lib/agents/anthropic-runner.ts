import Anthropic from '@anthropic-ai/sdk';
import { isPaidLlmAllowed } from '@/lib/llm/paid-llm-gate';
import { trackApiCall } from '@/lib/utils/api-tracker';
import type { AgentJobId } from '@/lib/agents/constants';
import { AGENT_USAGE_ENDPOINT } from '@/lib/agents/constants';

const SONNET_MODEL = 'claude-haiku-4-5-20251001';

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!client) client = new Anthropic({ apiKey: key });
  return client;
}

export type VisionPart =
  | { type: 'text'; text: string }
  | { type: 'image'; media_type: 'image/png' | 'image/jpeg'; data: string };

/**
 * One Sonnet call for an agent; logs spend under agent-specific api_usage endpoint.
 */
export async function runAgentSonnet(params: {
  job: AgentJobId;
  system: string;
  messages: Anthropic.MessageParam[];
}): Promise<{ text: string; inputTokens: number; outputTokens: number } | { error: string }> {
  const anthropic = getClient();
  if (!anthropic) {
    return { error: 'ANTHROPIC_API_KEY not configured' };
  }

  if (!isPaidLlmAllowed()) {
    return { error: 'Paid LLM disabled (set ALLOW_PAID_LLM=true)' };
  }

  try {
    const res = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 4096,
      system: params.system,
      messages: params.messages,
    });

    const text = (res.content ?? [])
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    const inputTokens = res.usage?.input_tokens ?? 0;
    const outputTokens = res.usage?.output_tokens ?? 0;

    await trackApiCall({
      userId: null,
      model: SONNET_MODEL,
      inputTokens,
      outputTokens,
      callType: AGENT_USAGE_ENDPOINT[params.job],
    });

    return { text, inputTokens, outputTokens };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }
}

/**
 * Multimodal Sonnet (screenshots as base64).
 */
export async function runAgentSonnetVision(params: {
  job: AgentJobId;
  system: string;
  userParts: VisionPart[];
}): Promise<{ text: string; inputTokens: number; outputTokens: number } | { error: string }> {
  const anthropic = getClient();
  if (!anthropic) {
    return { error: 'ANTHROPIC_API_KEY not configured' };
  }

  if (!isPaidLlmAllowed()) {
    return { error: 'Paid LLM disabled (set ALLOW_PAID_LLM=true)' };
  }

  const content: Anthropic.ContentBlockParam[] = params.userParts.map((p) => {
    if (p.type === 'text') {
      return { type: 'text', text: p.text };
    }
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: p.media_type,
        data: p.data,
      },
    };
  });

  try {
    const res = await anthropic.messages.create({
      model: SONNET_MODEL,
      max_tokens: 4096,
      system: params.system,
      messages: [{ role: 'user', content }],
    });

    const text = (res.content ?? [])
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    const inputTokens = res.usage?.input_tokens ?? 0;
    const outputTokens = res.usage?.output_tokens ?? 0;

    await trackApiCall({
      userId: null,
      model: SONNET_MODEL,
      inputTokens,
      outputTokens,
      callType: AGENT_USAGE_ENDPOINT[params.job],
    });

    return { text, inputTokens, outputTokens };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg };
  }
}
