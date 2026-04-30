/**
 * GET /api/dev/send-log
 *
 * Returns the last 10 SEND-path directives (status=pending_approval) so you
 * can inspect output quality without opening the UI.
 *
 * Only active when ALLOW_DEV_ROUTES=true (local / dev environments).
 * Requires a valid session — never exposes another user's data.
 *
 * Usage:
 *   curl http://localhost:3000/api/dev/send-log \
 *     -H "Cookie: <your next-auth session cookie>"
 *
 * Each record returned:
 *   id            — action UUID
 *   action_type   — send_message | make_decision | do_nothing
 *   confidence    — generator confidence (0–100)
 *   generated_at  — ISO timestamp
 *   artifact_type — drafted_email | decision_frame | etc.
 *   to_domain     — recipient domain (e.g. "example.com"); null if non-email
 *   subject       — email subject line; null if not applicable
 *   body_chars    — character count of body (not the content)
 *   evidence_count — number of evidence items used
 *   approve       — null (not yet reviewed) | true | false
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { createServerClient } from '@/lib/db/client';
import { blockDevRouteDuringEgressEmergency } from '@/lib/utils/egress-emergency';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const emergencyBlock = blockDevRouteDuringEgressEmergency(request);
  if (emergencyBlock) return emergencyBlock;

  if (process.env.ALLOW_DEV_ROUTES !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('tkg_actions')
    .select('id, action_type, confidence, generated_at, artifact, execution_result')
    .eq('user_id', session.user.id)
    .eq('status', 'pending_approval')
    .order('generated_at', { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((row: {
    id: string;
    action_type: string;
    confidence: number;
    generated_at: string;
    artifact: Record<string, unknown> | null;
    execution_result: Record<string, unknown> | null;
  }) => {
    const artifact = row.artifact ?? {};
    const to = typeof artifact.to === 'string' ? artifact.to : null;
    const body = typeof artifact.body === 'string' ? artifact.body : null;
    const subject = typeof artifact.subject === 'string' ? artifact.subject : null;
    const approve = row.execution_result ? (row.execution_result.approve ?? null) : null;
    const evidence = Array.isArray(row.execution_result?.evidence)
      ? (row.execution_result!.evidence as unknown[]).length
      : null;

    return {
      id: row.id,
      action_type: row.action_type,
      confidence: row.confidence,
      generated_at: row.generated_at,
      artifact_type: typeof artifact.type === 'string' ? artifact.type : null,
      to_domain: to ? (to.split('@')[1] ?? null) : null,
      subject,
      body_chars: body !== null ? body.length : null,
      evidence_count: evidence,
      approve,
    };
  });

  return NextResponse.json({ count: rows.length, rows });
}
