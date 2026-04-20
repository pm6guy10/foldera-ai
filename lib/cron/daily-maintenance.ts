import { createServerClient } from '@/lib/db/client';
import { SIGNAL_RETENTION_DAYS, daysMs } from '@/lib/config/constants';

export interface ConfidenceBand {
  band: string;
  total: number;
  approved: number;
  skipped: number;
  approval_rate: number;
}

export async function listSignalRetentionUserIds(testUserId: string): Promise<string[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('user_tokens')
    .select('user_id')
    .is('disconnected_at', null);

  if (error) {
    throw error;
  }

  return [...new Set((data ?? []).map((row) => row.user_id as string))]
    .filter((id) => id !== testUserId);
}

export async function purgeOldExtractedSignals(userIds: string[]): Promise<{ ok: boolean; deleted: number }> {
  const supabase = createServerClient();
  const cutoffIso = new Date(Date.now() - daysMs(SIGNAL_RETENTION_DAYS)).toISOString();
  let deleted = 0;

  for (const userId of userIds) {
    const { data, error } = await supabase
      .from('tkg_signals')
      .delete()
      .eq('user_id', userId)
      .lt('occurred_at', cutoffIso)
      .not('extracted_entities', 'is', null)
      .select('id');

    if (error) {
      throw error;
    }

    deleted += (data ?? []).length;
  }

  return { ok: true, deleted };
}

export async function completeSuppressedCommitments(): Promise<number> {
  const supabase = createServerClient();
  const { data: updatedRows, error } = await supabase
    .from('tkg_commitments')
    .update({
      status: 'fulfilled',
      updated_at: new Date().toISOString(),
    })
    .not('suppressed_at', 'is', null)
    .eq('status', 'active')
    .select('id');

  if (error) {
    throw error;
  }

  return (updatedRows ?? []).length;
}

function extractFirstNameFromDirective(text: string): string | null {
  const patterns = [
    /(?:email|message|reach out to|follow up with|contact|write to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /(?:to|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:about|regarding|re:)/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m?.[1] && m[1].length >= 3) return m[1];
  }
  return null;
}

export async function trackReplyOutcomes(): Promise<{ ok: boolean; checked: number; closed: number }> {
  const supabase = createServerClient();
  const fourteenDaysAgo = new Date(Date.now() - daysMs(14)).toISOString();

  const { data: executedActions } = await supabase
    .from('tkg_actions')
    .select('id, user_id, directive_text, executed_at')
    .eq('action_type', 'send_message')
    .in('status', ['executed', 'approved'])
    .eq('outcome_closed', false)
    .gte('executed_at', fourteenDaysAgo)
    .order('executed_at', { ascending: false })
    .limit(50);

  if (!executedActions || executedActions.length === 0) {
    return { ok: true, checked: 0, closed: 0 };
  }

  let closed = 0;
  for (const action of executedActions) {
    const entityName = extractFirstNameFromDirective(action.directive_text as string ?? '');
    if (!entityName) continue;

    const { data: replies } = await supabase
      .from('tkg_signals')
      .select('id')
      .eq('user_id', action.user_id as string)
      .eq('type', 'email_received')
      .gt('occurred_at', action.executed_at as string)
      .limit(20);

    if (!replies || replies.length === 0) continue;

    const { error } = await supabase
      .from('tkg_actions')
      .update({ outcome_closed: true })
      .eq('id', action.id as string);

    if (!error) {
      closed++;
    }
  }

  return { ok: true, checked: executedActions.length, closed };
}

export async function runConfidenceCalibration(): Promise<{
  ok: boolean;
  bands: ConfidenceBand[];
  anomalies: string[];
}> {
  const supabase = createServerClient();
  const thirtyDaysAgo = new Date(Date.now() - daysMs(30)).toISOString();

  const { data: actions, error } = await supabase
    .from('tkg_actions')
    .select('confidence, status')
    .in('status', ['executed', 'approved', 'skipped'])
    .not('confidence', 'is', null)
    .gte('generated_at', thirtyDaysAgo);

  if (error) throw error;
  if (!actions || actions.length === 0) {
    return { ok: true, bands: [], anomalies: ['no_actions_in_window'] };
  }

  const bandDefs: [string, number, number][] = [
    ['45-55', 45, 55],
    ['55-65', 55, 65],
    ['65-75', 65, 75],
    ['75-85', 75, 85],
    ['85+', 85, 101],
  ];

  const bands: ConfidenceBand[] = bandDefs.map(([band, lo, hi]) => {
    const inBand = actions.filter((a: any) => {
      const c = Number(a.confidence);
      return c >= lo && c < hi;
    });
    const approved = inBand.filter((a: any) =>
      a.status === 'executed' || a.status === 'approved',
    ).length;
    const skipped = inBand.filter((a: any) => a.status === 'skipped').length;
    const total = inBand.length;
    return {
      band,
      total,
      approved,
      skipped,
      approval_rate: total > 0 ? Math.round((approved / total) * 100) : 0,
    };
  });

  const anomalies: string[] = [];
  for (const b of bands) {
    if (b.total < 5) continue;
    if ((b.band === '45-55' || b.band === '55-65') && b.approval_rate > 50) {
      anomalies.push(`${b.band}: ${b.approval_rate}% approval — threshold may be too high`);
    }
    if ((b.band === '75-85' || b.band === '85+') && b.approval_rate < 30) {
      anomalies.push(`${b.band}: ${b.approval_rate}% approval — sending low-quality directives`);
    }
  }

  return { ok: true, bands, anomalies };
}
