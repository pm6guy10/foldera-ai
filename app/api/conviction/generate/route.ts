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
import { apiErrorForRoute } from '@/lib/utils/api-error';
import {
  buildDirectiveExecutionResult,
  generateDirective,
  validateDirectiveForPersistence,
} from '@/lib/briefing/generator';
import { generateArtifact } from '@/lib/conviction/artifact-generator';
import { processUnextractedSignals } from '@/lib/signals/signal-processor';
import { logStructuredEvent } from '@/lib/utils/structured-logger';
import { getWinnerTruthReport } from '@/lib/system/winner-truth';
import { buildSelectedWinnerFingerprint } from '@/lib/conviction/selected-winner-fingerprint';
import type { ConvictionDirective, EvidenceItem } from '@/lib/briefing/types';

export const dynamic = 'force-dynamic';

type WinnerTruthCard = {
  claim?: unknown;
  contradiction?: unknown;
  risk?: unknown;
  evidence?: unknown;
  next_action?: unknown;
  why_now?: unknown;
  source_refs?: unknown;
  confidence?: unknown;
};

type SelectedWinnerIdentity = {
  selected_winner_fingerprint: string;
  selected_winner_claim: string;
  selected_winner_source_refs: string[];
};

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : null))
    .filter((entry): entry is string => Boolean(entry));
}

function evidenceTypeForSourceRef(value: string | null | undefined): EvidenceItem['type'] {
  if (!value) return 'signal';
  if (value.startsWith('commitment:')) return 'commitment';
  if (value.startsWith('goal:')) return 'goal';
  if (value.startsWith('pattern:') || value.startsWith('candidate:')) return 'pattern';
  return 'signal';
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 82;
  if (value <= 1) return Math.round(value * 100);
  return Math.round(Math.max(0, Math.min(100, value)));
}

function buildSelectedMoveDirective(card: WinnerTruthCard): ConvictionDirective | null {
  const claim = asString(card.claim);
  const nextAction = asString(card.next_action);
  const risk = asString(card.risk);
  const whyNow = asString(card.why_now);
  if (!claim || !nextAction || !risk) return null;

  const sourceRefs = asStringArray(card.source_refs);
  const cardEvidence = asStringArray(card.evidence);
  const evidence: EvidenceItem[] = cardEvidence.length > 0
    ? cardEvidence.map((description, index) => ({
        type: evidenceTypeForSourceRef(sourceRefs[index]),
        description,
      }))
    : [{ type: 'signal', description: claim }];

  return {
    directive: nextAction,
    action_type: 'write_document',
    confidence: normalizeConfidence(card.confidence),
    reason: whyNow ?? risk,
    evidence,
    requires_search: false,
    discrepancyClass: 'deadline_staleness',
  };
}

function buildSelectedWinnerIdentity(card: WinnerTruthCard): SelectedWinnerIdentity | null {
  const claim = asString(card.claim);
  const sourceRefs = asStringArray(card.source_refs);
  const fingerprint = buildSelectedWinnerFingerprint({ claim, source_refs: sourceRefs });
  if (!claim || !fingerprint) return null;
  return {
    selected_winner_fingerprint: fingerprint,
    selected_winner_claim: claim,
    selected_winner_source_refs: sourceRefs,
  };
}

async function generateSelectedMoveDirective(userId: string): Promise<{
  directive: ConvictionDirective;
  identity: SelectedWinnerIdentity | null;
} | null> {
  const report = await getWinnerTruthReport(userId);
  const winner = report.current_winner;
  if (winner.verdict !== 'selected' || !winner.discrepancy_card) return null;
  const directive = buildSelectedMoveDirective(winner.discrepancy_card);
  if (!directive) return null;
  return {
    directive,
    identity: buildSelectedWinnerIdentity(winner.discrepancy_card),
  };
}

export async function POST(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;
  const url = new URL(request.url);
  const useSelectedMove = url.searchParams.get('source') === 'winner_truth';

  try {
    let directive: ConvictionDirective | null = null;
    let selectedWinnerIdentity: SelectedWinnerIdentity | null = null;

    if (useSelectedMove) {
      const selectedMove = await generateSelectedMoveDirective(userId);
      if (!selectedMove) {
        return NextResponse.json(
          { error: 'No selected move available for deterministic persistence' },
          { status: 409 },
        );
      }
      directive = selectedMove.directive;
      selectedWinnerIdentity = selectedMove.identity;
    } else {
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
      directive = await generateDirective(userId, {
        dryRun: process.env.FOLDERA_DRY_RUN === 'true',
      });
    }

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
        artifact,
        status:           'pending_approval',
        generated_at:     new Date().toISOString(),
        execution_result: buildDirectiveExecutionResult({
          directive,
          artifact,
          briefOrigin: useSelectedMove ? 'selected_move_generate' : 'dashboard_generate',
          extras: selectedWinnerIdentity ?? undefined,
        }),
      })
      .select('id, generated_at, status, execution_result')
      .single();

    if (error) {
      return apiErrorForRoute(error, 'conviction/generate');
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
    return apiErrorForRoute(err, 'conviction/generate');
  }
}
