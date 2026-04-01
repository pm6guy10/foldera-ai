export type AgentJobId =
  | 'health_watchdog'
  | 'ui_critic'
  | 'gtm_strategist'
  | 'distribution_finder'
  | 'retention_analyst'
  | 'self_optimizer';

/** api_usage.endpoint values for cost caps */
export const AGENT_USAGE_ENDPOINT: Record<AgentJobId, string> = {
  health_watchdog: 'agent:health_watchdog',
  ui_critic: 'agent:ui_critic',
  gtm_strategist: 'agent:gtm_strategist',
  distribution_finder: 'agent:distribution_finder',
  retention_analyst: 'agent:retention_analyst',
  self_optimizer: 'agent:self_optimizer',
};

/** Max USD per run (UTC day summed by endpoint). Health = $0 (no LLM). */
export const AGENT_RUN_CAP_USD: Record<AgentJobId, number> = {
  health_watchdog: 0,
  ui_critic: 0.5,
  gtm_strategist: 0.1,
  distribution_finder: 0.2,
  retention_analyst: 0.1,
  self_optimizer: 0.1,
};

export function actionSourceForAgent(job: AgentJobId): string {
  return `agent_${job}`;
}
