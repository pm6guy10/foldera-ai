import { getGlobalEndpointSpendToday } from '@/lib/utils/api-tracker';
import type { AgentJobId } from '@/lib/agents/constants';
import { AGENT_RUN_CAP_USD, AGENT_USAGE_ENDPOINT } from '@/lib/agents/constants';

export async function hasAgentBudget(job: AgentJobId): Promise<{
  ok: boolean;
  spent: number;
  cap: number;
}> {
  const cap = AGENT_RUN_CAP_USD[job];
  if (cap <= 0) {
    return { ok: true, spent: 0, cap: 0 };
  }

  const endpoint = AGENT_USAGE_ENDPOINT[job];
  const spent = await getGlobalEndpointSpendToday(endpoint);
  return { ok: spent < cap, spent, cap };
}
