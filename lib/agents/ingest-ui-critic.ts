import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { insertAgentDraft } from '@/lib/agents/draft-queue';
import { trackApiCall } from '@/lib/utils/api-tracker';
import { AGENT_USAGE_ENDPOINT } from '@/lib/agents/constants';
import { hasAgentBudget } from '@/lib/agents/cost-guard';

const itemSchema = z.object({
  page_path: z.string(),
  viewport_label: z.string(),
  scores_json: z.string().optional(),
  critique: z.string(),
  fix_prompt: z.string(),
  below_seven: z.boolean(),
});

const bodySchema = z.object({
  items: z.array(itemSchema).min(1).max(40),
  llm_usage: z
    .object({
      model: z.string(),
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
    })
    .optional(),
});

export type UiCriticIngestInput = z.infer<typeof bodySchema>;

/**
 * Persist UI critic findings from CI (Playwright screenshots → Sonnet already ran in CI).
 */
export async function ingestUiCriticItems(
  supabase: SupabaseClient,
  input: UiCriticIngestInput,
): Promise<{ staged: number; errors: string[]; skipped_reason?: string }> {
  const parsed = bodySchema.safeParse(input);
  if (!parsed.success) {
    return { staged: 0, errors: [parsed.error.message] };
  }

  const u = parsed.data.llm_usage;
  if (u) {
    await trackApiCall({
      userId: null,
      model: u.model,
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      callType: AGENT_USAGE_ENDPOINT.ui_critic,
    });
  }

  const budget = await hasAgentBudget('ui_critic');
  if (!budget.ok) {
    return {
      staged: 0,
      errors: [],
      skipped_reason: `budget_exhausted: spent ${budget.spent} cap ${budget.cap}`,
    };
  }

  let staged = 0;
  const errors: string[] = [];

  for (const it of parsed.data.items) {
    if (!it.below_seven) continue;

    const title = `UI critique: ${it.page_path} (${it.viewport_label})`;
    const ins = await insertAgentDraft(supabase, 'ui_critic', {
      title,
      directiveLine: `UI/UX below threshold — ${it.page_path} @ ${it.viewport_label}`,
      body: [
        '## Scores (model output)',
        it.scores_json ?? '(see critique)',
        '',
        '## Critique',
        it.critique,
      ].join('\n'),
      fixPrompt: it.fix_prompt,
      extraExecutionFields: {
        page_path: it.page_path,
        viewport: it.viewport_label,
      },
    });
    if ('error' in ins) errors.push(ins.error);
    else staged++;
  }

  return { staged, errors };
}
