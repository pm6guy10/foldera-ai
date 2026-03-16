/**
 * POST /api/conviction/generate
 *
 * Runs the full conviction pipeline:
 * 1. Pull signals + commitments + goals + patterns
 * 2. Call generateDirective() → single directive
 * 3. Log result to tkg_actions with status=pending_approval
 * 4. Return the ConvictionAction to the client
 */

import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { apiError } from '@/lib/utils/api-error';
import { generateDirective } from '@/lib/briefing/generator';
import { generateArtifact } from '@/lib/conviction/artifact-generator';
import { processUnextractedSignals } from '@/lib/signals/signal-processor';

export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    // Extract entities/commitments/topics from unprocessed sync signals
    try {
      const extraction = await processUnextractedSignals(userId);
      if (extraction.signals_processed > 0) {
        console.log(
          `[conviction/generate] signal extraction: ` +
          `${extraction.signals_processed} signals, ${extraction.entities_upserted} entities, ` +
          `${extraction.commitments_created} commitments, ${extraction.topics_merged} topics`,
        );
      }
    } catch (extractErr: unknown) {
      // Non-fatal — directive generation can still proceed with existing data
      console.warn('[conviction/generate] signal extraction failed:', extractErr instanceof Error ? extractErr.message : extractErr);
    }

    // Generate the directive
    const directive = await generateDirective(userId);

    // Generate the artifact (finished work product)
    let artifact = null;
    try {
      artifact = await generateArtifact(userId, directive);
    } catch (artErr: any) {
      console.warn('[conviction/generate] artifact generation failed:', artErr.message);
    }

    // Log to tkg_actions
    const supabase = createServerClient();
    const { data: action, error } = await supabase
      .from('tkg_actions')
      .insert({
        user_id:          userId,
        directive_text:   directive.directive,
        action_type:      directive.action_type,
        confidence:       directive.confidence,
        reason:           directive.reason,
        evidence:         directive.evidence,
        status:           'pending_approval',
        generated_at:     new Date().toISOString(),
        execution_result: artifact ? { artifact } : null,
      })
      .select('id, generated_at, status, execution_result')
      .single();

    if (error) {
      return apiError(error, 'conviction/generate');
    }

    return NextResponse.json({
      ...directive,
      id:              action.id,
      userId,
      status:          action.status,
      generatedAt:     action.generated_at,
      executionResult: action.execution_result,
    });
  } catch (err: unknown) {
    return apiError(err, 'conviction/generate');
  }
}
