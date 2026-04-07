/**
 * AsyncLocalStorage context so api_usage rows can attach pipeline_run_id during generateDirective.
 */

import { AsyncLocalStorage } from 'async_hooks';

export type PipelineRunStore = {
  pipelineRunId: string;
  userId: string;
};

const als = new AsyncLocalStorage<PipelineRunStore>();

export function getPipelineRunContext(): PipelineRunStore | undefined {
  return als.getStore();
}

export function runWithPipelineRunContext<T>(
  store: PipelineRunStore,
  fn: () => Promise<T>,
): Promise<T> {
  return als.run(store, fn);
}
