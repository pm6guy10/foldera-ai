/**
 * Zod schemas for API request bodies.
 * Use with parseAsync; on failure return 400 with safe message.
 */

import { z } from 'zod';

const UUID = z.string().uuid();

export const executeBodySchema = z.object({
  action_id: z.string().min(1, 'action_id required'),
  decision: z.enum(['approve', 'skip']),
  skip_reason: z.enum(['not_relevant', 'already_handled', 'wrong_approach']).optional(),
});

export const draftsDecideBodySchema = z.object({
  draft_id: z.string().min(1, 'draft_id required'),
  decision: z.enum(['approve', 'reject']),
});

export const onboardSaveBodySchema = z.object({
  email: z.string().email('Valid email required').transform(s => s.toLowerCase().trim()),
  tempUserId: z.string().uuid('Invalid tempUserId'),
});

export const ingestBodySchema = z.object({
  text: z.string().min(50, 'text must be at least 50 characters'),
  tempUserId: UUID,
});

export const onboardGoalsBodySchema = z.object({
  answers: z.array(z.string()).min(1).max(5),
  tempUserId: UUID,
});

export type ExecuteBody = z.infer<typeof executeBodySchema>;
export type DraftsDecideBody = z.infer<typeof draftsDecideBodySchema>;
export type OnboardSaveBody = z.infer<typeof onboardSaveBodySchema>;
