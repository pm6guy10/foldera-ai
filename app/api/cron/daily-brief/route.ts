/**
 * GET /api/cron/daily-brief
 *
 * ONE email per day. ONE directive per email.
 * If nothing scores above 70% confidence, send "Nothing today" or skip entirely.
 * Errors never leak into the email as directives.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCronAuth } from '@/lib/auth/resolve-user';
import { createServerClient, type SupabaseClient } from '@/lib/db/client';
import { generateDirective } from '@/lib/briefing/generator';
import { generateArtifact, getFallbackArtifact } from '@/lib/conviction/artifact-generator';
import { sendDailyDirective } from '@/lib/email/resend';
import { apiError } from '@/lib/utils/api-error';
import { extractFromConversation } from '@/lib/extraction/conversation-extractor';
import type { DirectiveItem } from '@/lib/email/resend';
import type { ConvictionArtifact } from '@/lib/briefing/types';

export const dynamic = 'force-dynamic';

const CONFIDENCE_THRESHOLD = 70;

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  delayMs = 30_000,
): Promise<{ value: T; attempts: number } | { error: string; attempts: number }> {
  try {
    return { value: await fn(), attempts: 1 };
  } catch (firstErr: unknown) {
    const msg1 = firstErr instanceof Error ? firstErr.message : String(firstErr);
    console.warn(`[daily-brief] ${label} failed (attempt 1): ${msg1} — retrying in ${delayMs}ms`);
    await new Promise(r => setTimeout(r, delayMs));
    try {
      return { value: await fn(), attempts: 2 };
    } catch (secondErr: unknown) {
      const msg2 = secondErr instanceof Error ? secondErr.message : String(secondErr);
      console.error(`[daily-brief] ${label} failed (attempt 2): ${msg2}`);
      return { error: msg2, attempts: 2 };
    }
  }
}

type GeneratedDirective = Awaited<ReturnType<typeof generateDirective>>;

async function saveDirectiveAction(
  supabase: SupabaseClient,
  userId: string,
  d: GeneratedDirective,
  attempts: number,
  lastError?: string,
): Promise<string | null> {
  const base = {
    user_id: userId, action_type: d.action_type, directive_text: d.directive,
    reason: d.reason, status: 'pending_approval', confidence: d.confidence,
    evidence: d.evidence, generated_at: new Date().toISOString(),
    execution_result: lastError ? { last_error: lastError, generation_attempts: attempts } : null,
  };
  const { data, error } = await supabase
    .from('tkg_actions')
    .insert({ ...base, generation_attempts: attempts, last_error: lastError ?? null })
    .select('id').single();
  if (!error) return data?.id ?? null;
  const { data: d2 } = await supabase.from('tkg_actions').insert(base).select('id').single();
  return d2?.id ?? null;
}

async function handler(request: NextRequest) {
  const authErr = validateCronAuth(request);
  if (authErr) return authErr;

  const to = process.env.DAILY_BRIEF_TO_EMAIL;
  if (!to) return NextResponse.json({ error: 'DAILY_BRIEF_TO_EMAIL is not set' }, { status: 500 });

  const date = new Date().toISOString().slice(0, 10);
  const supabase = createServerClient();

  // Expire old trials
  await supabase.from('user_subscriptions').update({ status: 'expired' })
    .eq('plan', 'trial').eq('status', 'active').lte('current_period_end', new Date().toISOString());

  const { data: entities, error } = await supabase.from('tkg_entities').select('user_id').eq('name', 'self');
  if (error) return apiError(error, 'cron/daily-brief');

  const userIds = [...new Set((entities ?? []).map((e: { user_id: string }) => e.user_id))];
  if (userIds.length === 0) return NextResponse.json({ sent: 0, message: 'No users with graph data' });

  const results: Array<{ userId: string; success: boolean; error?: string }> = [];

  for (const userId of userIds) {
    try {
      const { data: sub } = await supabase
        .from('user_subscriptions').select('created_at, status').eq('user_id', userId).maybeSingle();

      // Skip expired trials (but exempt the owner account)
      if (sub?.status === 'expired' && userId !== 'e40b7cd8-4925-42f7-bc99-5022969f1d22') {
        results.push({ userId, success: false, error: 'trial expired' }); continue;
      }

      // ── Generate ONE directive ──
      const result = await withRetry(() => generateDirective(userId), 'generateDirective');

      if ('error' in result) {
        // Generation completely failed — log it, do NOT send error as directive
        console.error(`[daily-brief] generation failed for ${userId}: ${result.error}`);
        results.push({ userId, success: false, error: `generation failed: ${result.error}` });
        continue;
      }

      const directive = result.value;

      // Check for generation failure sentinel
      if (directive.directive === '__GENERATION_FAILED__') {
        console.error(`[daily-brief] generation returned failure sentinel for ${userId}`);
        results.push({ userId, success: false, error: 'generation returned failure sentinel' });
        continue;
      }

      // ── Confidence threshold: below 70% = "Nothing today" ──
      if (directive.confidence < CONFIDENCE_THRESHOLD) {
        console.log(`[daily-brief] confidence ${directive.confidence}% < ${CONFIDENCE_THRESHOLD}% — sending "Nothing today" for ${userId}`);

        const sendResult = await withRetry(
          () => sendDailyDirective({
            to, date,
            subject: 'Foldera: Nothing today',
            directives: [],
          }),
          `sendNothingToday for ${userId}`,
        );
        if ('error' in sendResult) {
          results.push({ userId, success: false, error: `nothing-today send failed: ${sendResult.error}` }); continue;
        }
        results.push({ userId, success: true });
        continue;
      }

      // ── Save to tkg_actions ──
      const actionId = await saveDirectiveAction(supabase, userId, directive, result.attempts);

      // ── Generate artifact ──
      let artifact: ConvictionArtifact | null = null;
      try {
        artifact = await generateArtifact(userId, directive);
      } catch (artErr: unknown) {
        console.warn('[daily-brief] artifact generation failed:', artErr instanceof Error ? artErr.message : artErr);
        artifact = getFallbackArtifact(directive);
      }

      // Validate email artifacts
      if (artifact && (['email', 'drafted_email'].includes((artifact as any).type as string))) {
        const emailArtifact = artifact as any;
        const missingFields: string[] = [];
        if (!emailArtifact.to?.trim()) missingFields.push('recipient');
        if (!emailArtifact.subject?.trim()) missingFields.push('subject');
        if (!emailArtifact.body?.trim()) missingFields.push('body');
        if (missingFields.length > 0) {
          console.warn(`[daily-brief] email artifact missing ${missingFields.join(', ')} — rejecting`);
          if (actionId) {
            await supabase.from('tkg_actions').update({
              status: 'draft_rejected',
              execution_result: { generation_error: `Missing: ${missingFields.join(', ')}`, artifact_type: artifact.type },
            }).eq('id', actionId);
          }
          // Send "Nothing today" instead of broken artifact
          await withRetry(
            () => sendDailyDirective({ to, date, subject: 'Foldera: Nothing today', directives: [] }),
            `sendNothingToday-fallback for ${userId}`,
          );
          results.push({ userId, success: true });
          continue;
        }
      }

      if (actionId && artifact) {
        await supabase.from('tkg_actions').update({ execution_result: { artifact } }).eq('id', actionId);
      }

      // ── Build the ONE directive item ──
      const directiveItem: DirectiveItem = {
        id: actionId ?? undefined,
        directive: directive.directive,
        action_type: directive.action_type,
        confidence: directive.confidence,
        reason: directive.reason?.split('[score=')[0].trim() ?? '',
      };

      // Subject: first 6 words of directive
      const words = directive.directive.split(/\s+/).slice(0, 6).join(' ');
      const subject = `Foldera: ${words.length > 50 ? words.slice(0, 47) + '...' : words}`;

      // ── Send ONE email ──
      const sendResult = await withRetry(
        () => sendDailyDirective({ to, directives: [directiveItem], date, subject }),
        `sendDailyDirective for ${userId}`,
      );
      if ('error' in sendResult) {
        results.push({ userId, success: false, error: `email send failed: ${sendResult.error}` }); continue;
      }

      // Self-feeding loop
      try {
        const feedText = [
          `[Foldera Directive — ${date}]`,
          `Action: ${directive.action_type}`,
          `Directive: ${directive.directive}`,
          `Reason: ${directive.reason}`,
        ].filter(Boolean).join('\n');
        await extractFromConversation(feedText, userId);
      } catch (feedErr: any) {
        if (!feedErr.message?.includes('already ingested')) {
          console.warn('[daily-brief] self-feed extraction failed:', feedErr.message);
        }
      }

      results.push({ userId, success: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[daily-brief] failed for ${userId}:`, msg);
      results.push({ userId, success: false, error: msg });
    }
  }

  const sent = results.filter(r => r.success).length;
  const errors = results.filter(r => !r.success);
  console.log(`[daily-brief] ${date} — sent ${sent}/${userIds.length}`);

  return NextResponse.json({ date, sent, total: userIds.length, errors });
}

export const GET = handler;
export const POST = handler;
