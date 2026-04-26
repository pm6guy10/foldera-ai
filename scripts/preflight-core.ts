export interface ActionRow {
  action_type: string | null;
  directive_text: string | null;
  generated_at: string | null;
  status: string | null;
  confidence: number | null;
  artifact: { title?: string; type?: string } | null;
}

export type Verdict = 'PASS' | 'FAIL' | 'WARN';

export interface CheckResult {
  name: string;
  verdict: Verdict;
  detail: string;
  fix?: string;
}

function summarizeRow(row: ActionRow | undefined): string {
  if (!row) return 'unknown';
  const raw = row.directive_text ?? row.action_type ?? 'unknown';
  const compact = raw.replace(/\s+/g, ' ').trim();
  return compact.length > 120 ? `${compact.slice(0, 117)}...` : compact;
}

export function evaluatePaidLlmGate(
  rows: readonly ActionRow[],
  relAgo: (iso: string | null | undefined) => string,
): CheckResult {
  const paidLlmDisabledCount = rows.filter(
    (r) => r.directive_text === 'paid_llm_disabled',
  ).length;

  if (paidLlmDisabledCount < 3) {
    return {
      name: 'Paid LLM gate',
      verdict: 'PASS',
      detail: `${paidLlmDisabledCount} of ${rows.length} recent actions are paid_llm_disabled.`,
    };
  }

  const latestPaidLlmDisabledIndex = rows.findIndex(
    (r) => r.directive_text === 'paid_llm_disabled',
  );
  const newerNonPaidRow =
    latestPaidLlmDisabledIndex > 0
      ? rows
          .slice(0, latestPaidLlmDisabledIndex)
          .find((r) => r.directive_text !== 'paid_llm_disabled')
      : undefined;

  if (newerNonPaidRow) {
    return {
      name: 'Paid LLM gate',
      verdict: 'WARN',
      detail:
        `${paidLlmDisabledCount} of last ${rows.length} actions are paid_llm_disabled, ` +
        `but the latest action moved to "${summarizeRow(newerNonPaidRow)}" (${relAgo(newerNonPaidRow.generated_at)}).`,
      fix: 'Paid gate appears cleared on the newest live row. Investigate that newer blocker before code work.',
    };
  }

  return {
    name: 'Paid LLM gate',
    verdict: 'FAIL',
    detail: `${paidLlmDisabledCount} of last ${rows.length} actions are paid_llm_disabled.`,
    fix: 'Ensure the production paid-LLM env contract is live on the latest deployment, then rerun one real generation path.',
  };
}
