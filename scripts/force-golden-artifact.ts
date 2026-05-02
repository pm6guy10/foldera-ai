/**
 * Force one golden pending_approval artifact into production tkg_actions.
 *
 * Bypasses the generator entirely. Inserts a single hand-authored document
 * artifact so the dashboard + daily-brief email surfaces can be verified
 * against a known-good payload.
 *
 * Shape requirements (cross-checked against code):
 *   - action_type = 'write_document'
 *       (CHECK constraint in supabase/migrations/20260401000002_fix_tkg_actions_action_type_check.sql)
 *   - status = 'pending_approval'
 *   - confidence >= 70
 *       (CONFIDENCE_SEND_THRESHOLD in lib/config/constants.ts; also the dashboard
 *        MIN_PENDING_CONFIDENCE filter in app/api/conviction/latest/route.ts)
 *   - execution_result.artifact = { type: 'document', title, content }
 *       Dashboard: app/dashboard/page.tsx reads artifact.title + (body|text|content)
 *       Email:    lib/email/resend.ts renderArtifactHtml() reads artifact.title + artifact.content
 *       Generate: lib/cron/daily-brief-generate.ts extractArtifact() reads execution_result.artifact
 *   - artifact column also populated for the merged extractArtifact() path in
 *     app/api/conviction/latest/route.ts (column wins over execution_result).
 *
 * Usage:
 *   npx tsx scripts/force-golden-artifact.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });

const OWNER_USER_ID = 'e40b7cd8-4925-42f7-bc99-5022969f1d22';

const DIRECTIVE_TEXT =
  'Save the ESB Technician role-fit packet for Recruitment 2026-02344 before the Darlene Craig interview loop closes.';

const ARTIFACT_TITLE = 'ESB Technician Role-Fit Packet - Recruitment 2026-02344';

const ARTIFACT_CONTENT = `SOURCE
Email: Darlene Craig (darlene.craig@esd.wa.gov), April 21 - interview questions attached
Job posting: ES Benefits Technician, Recruitment 2026-02344, Employment Security Department
Resume: Brandon_Kapp_Resume_GOV.pdf

ESB TECHNICIAN ROLE-FIT PACKET
Recruitment 2026-02344 | ESD | Brandon Kapp

READY OPENING ANSWER

I come from public-service work where accuracy and documentation matter. I have done eligibility verification in ProviderOne, claims reconciliation, and high-volume coordination helping people who needed clear answers. I stay calm, learn systems quickly, and take accuracy seriously.

ROLE-FIT POINTS

1. Unemployment-insurance mission fit
I understand the role as a balance of temporary support for eligible workers and program integrity through accurate determinations. My benefits and claims work maps to that balance: verify the record, explain the next step, and leave documentation that another reviewer can trust.

2. High-volume caller environment
People call stressed, scared, or frustrated. My job is to stay calm, identify the real issue, and move the case forward without losing accuracy. I have done that with veterans, seniors, and families in healthcare and benefits settings.

3. Remote team reliability
I build trust remotely by being responsive, documenting clearly, asking early when something is unclear, and making the next handoff easy for the team.

4. Technical readiness
I am confident with multi-screen workflows, MS Office, Excel tracking, web portals, ProviderOne-style systems, and careful handling of protected information. When something breaks, I troubleshoot what I can and escalate with a clear description.

DECISION / HOW TO USE THIS

Save this as the answer base for the ESB Technician interview. Lead with accuracy, empathy, and documentation discipline; use the role-fit points above when Darlene asks why this role fits now.

QUESTIONS TO ASK

This role combines public service, accuracy, and helping people in tough financial moments. That is what I want to do.

Ask them:
- What makes someone strong in this role in the first six months?
- How do you coach new staff on balancing speed, empathy, and accuracy?
- When I hit a judgment call, what support helps me know when to resolve vs. escalate?

THREE THINGS TO KEEP COMING BACK TO
- Empathy + accuracy. People feel heard. Documentation still gets done right.
- Steady under pressure. Volume and tough calls do not make me sloppy.
- Comfortable remote. I learn tools fast, document clearly, protect sensitive info.`;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  const artifact = {
    type: 'document' as const,
    title: ARTIFACT_TITLE,
    content: ARTIFACT_CONTENT,
  };

  const generatedAt = new Date().toISOString();

  // Shape the persisted row to satisfy both surfaces:
  //  - dashboard via /api/conviction/latest (merges execution_result.artifact + artifact column)
  //  - email via daily-brief-send -> extractArtifact(execution_result)
  const row = {
    user_id: OWNER_USER_ID,
    directive_text: DIRECTIVE_TEXT,
    action_type: 'write_document' as const,
    confidence: 95,
    reason:
      'Darlene Craig sent interview questions for Recruitment 2026-02344 directly to you; the role-fit packet is the safe command-center artifact to save.',
    evidence: [
      {
        type: 'signal',
        description:
          'Email from darlene.craig@esd.wa.gov with interview questions for ESB Technician (2026-02344).',
        date: generatedAt,
      },
      {
        type: 'goal',
        description: 'Land ESB Technician role (Recruitment 2026-02344).',
      },
    ],
    status: 'pending_approval' as const,
    generated_at: generatedAt,
    execution_result: {
      artifact,
      _forced_golden: true,
      _forced_source: 'scripts/force-golden-artifact.ts',
    },
    artifact,
  };

  console.log('Inserting golden pending_approval row for user', OWNER_USER_ID, '...');

  const { data: inserted, error: insertErr } = await sb
    .from('tkg_actions')
    .insert(row)
    .select('id, user_id, status, action_type, confidence, generated_at')
    .single();

  if (insertErr || !inserted) {
    console.error('Insert failed:', insertErr?.message ?? 'no row returned');
    process.exit(1);
  }

  console.log('\n=== INSERTED ROW ===');
  console.log(JSON.stringify(inserted, null, 2));

  const { data: confirm, error: selErr } = await sb
    .from('tkg_actions')
    .select(
      'id, user_id, status, action_type, confidence, directive_text, generated_at, artifact, execution_result',
    )
    .eq('id', inserted.id)
    .single();

  if (selErr || !confirm) {
    console.error('Confirm SELECT failed:', selErr?.message ?? 'no row');
    process.exit(1);
  }

  const execArtifact =
    confirm.execution_result && typeof confirm.execution_result === 'object'
      ? (confirm.execution_result as Record<string, unknown>).artifact
      : null;

  console.log('\n=== SELECT CONFIRM ===');
  console.log(
    JSON.stringify(
      {
        id: confirm.id,
        user_id: confirm.user_id,
        status: confirm.status,
        action_type: confirm.action_type,
        confidence: confirm.confidence,
        generated_at: confirm.generated_at,
        directive_text: confirm.directive_text,
        artifact_column_type: (confirm.artifact as { type?: string } | null)?.type ?? null,
        execution_result_artifact_type: (execArtifact as { type?: string } | null)?.type ?? null,
        artifact_column_title: (confirm.artifact as { title?: string } | null)?.title ?? null,
        content_length:
          typeof (confirm.artifact as { content?: string } | null)?.content === 'string'
            ? (confirm.artifact as { content: string }).content.length
            : 0,
      },
      null,
      2,
    ),
  );

  if (confirm.status !== 'pending_approval') {
    console.error('\nFAIL: status is not pending_approval');
    process.exit(1);
  }

  console.log('\nOK: row is pending_approval with document artifact in both execution_result and artifact column.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
