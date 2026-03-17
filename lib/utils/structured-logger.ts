import { createHash } from 'crypto';

type LogLevel = 'info' | 'warn' | 'error';

export interface StructuredLogInput {
  event: string;
  level?: LogLevel;
  userId?: string | null;
  artifactType?: string | null;
  generationStatus: string;
  details?: Record<string, unknown>;
}

export function hashUserId(userId?: string | null): string | null {
  if (!userId) return null;
  return createHash('sha256').update(userId).digest('hex').slice(0, 12);
}

export function logStructuredEvent(input: StructuredLogInput): void {
  const payload = {
    timestamp: new Date().toISOString(),
    event: input.event,
    user_id_hash: hashUserId(input.userId),
    artifact_type: input.artifactType ?? null,
    generation_status: input.generationStatus,
    ...(input.details ?? {}),
  };

  const line = JSON.stringify(payload);
  switch (input.level ?? 'info') {
    case 'error':
      console.error(line);
      return;
    case 'warn':
      console.warn(line);
      return;
    default:
      console.info(line);
  }
}
