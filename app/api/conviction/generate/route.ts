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
import {
  buildDirectiveExecutionResult,
  generateDirective,
  validateDirectiveForPersistence,
} from '@/lib/briefing/generator';
import { generateArtifact } from '@/lib/conviction/artifact-generator';
import { processUnextractedSignals } from '@/lib/signals/signal-processor';
import { logStructuredEvent } from '@/lib/utils/structured-logger';

export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    // Extract entities/commitments/topics from unprocessed sync signals
    // Race with 7s timeout so we never blow the Hobby tier 10s limit
    try {
      const SIGNAL_TIMEOUT_MS = 7000;
      const extraction = await Promise.race([
        processUnextractedSignals(userId),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), SIGNAL_TIMEOUT_MS)),
      ]);
      if (extraction === null) {
        logStructuredEvent({
          event: 'conviction_generate_extraction_timeout',
          level: 'warn',
          userId,
          artifactType: null,
          generationStatus: 'signal_extraction_timeout',
          details: {
            scope: 'conviction/generate',
            timeout_ms: SIGNAL_TIMEOUT_MS,
          },
        });
      } else if (extraction.signals_processed > 0) {
        logStructuredEvent({
          event: 'conviction_generate_extraction_complete',
          userId,
          artifactType: null,
          generationStatus: 'signal_extraction_complete',
          details: {
            scope: 'conviction/generate',
            signals_processed: extraction.signals_processed,
            entities_upserted: extraction.entities_upserted,
            commitments_created: extraction.commitments_created,
            topics_merged: extraction.topics_merged,
          },
        });
      }
    } catch (extractErr: unknown) {
      // Non-fatal — directive generation can still proceed with existing data
      logStructuredEvent({
        event: 'conviction_generate_extraction_failed',
        level: 'warn',
        userId,
        artifactType: null,
        generationStatus: 'signal_extraction_failed',
        details: {
          scope: 'conviction/generate',
          error: extractErr instanceof Error ? extractErr.message : String(extractErr),
        },
      });
    }

    // Generate the directive
    const directive = await generateDirective(userId);

    // Check for generation failure sentinel
    if (directive.directive === '__GENERATION_FAILED__') {
      return NextResponse.json(
        { error: 'Directive generation failed' },
        { status: 500 },
      );
    }

    // Generate the artifact (finished work product)
    let artifact = null;
    try {
      artifact = await generateArtifact(userId, directive);
    } catch (artErr: unknown) {
      logStructuredEvent({
        event: 'conviction_generate_artifact_failed',
        level: 'warn',
        userId,
        artifactType: null,
        generationStatus: 'artifact_failed',
        details: {
          scope: 'conviction/generate',
          error: artErr instanceof Error ? artErr.message : String(artErr),
        },
      });
    }

    if (!artifact) {
      return NextResponse.json(
        { error: 'Artifact generation failed' },
        { status: 500 },
      );
    }

    const candidateType = directive.generationLog?.candidateDiscovery?.topCandidates?.[0]?.candidateType;
    const persistenceIssues = validateDirectiveForPersistence({
      userId,
      directive,
      artifact,
      candidateType,
    });
    if (persistenceIssues.length > 0) {
      return NextResponse.json(
        { error: 'Directive rejected by validation gate', issues: persistenceIssues },
        { status: 422 },
      );
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
        execution_result: buildDirectiveExecutionResult({
          directive,
          artifact,
          briefOrigin: 'dashboard_generate',
        }),
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
      artifact,
    });
  } catch (err: unknown) {
    return apiError(err, 'conviction/generate');
  }
}
