import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { apiErrorForRoute } from '@/lib/utils/api-error';
import {
  DOCUMENT_COLLECTION_INTAKE_READY_NEXT_ACTION,
  isDocumentCollectionRequirementsRecord,
  normalizeDocumentCollectionIntakeInput,
} from '@/lib/conviction/document-collection-intake';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

async function resolveParams(context: RouteContext): Promise<{ id: string }> {
  return context.params instanceof Promise ? await context.params : context.params;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const { id } = await resolveParams(context);
  if (!id) {
    return NextResponse.json({ error: 'Action id required' }, { status: 400 });
  }

  const raw = await request.json().catch(() => ({}));
  const input = normalizeDocumentCollectionIntakeInput({
    submissionUrl: (raw as Record<string, unknown>).submission_url,
    candidateDocuments: (raw as Record<string, unknown>).candidate_documents,
  });
  if (input.error) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    const { data: action, error } = await supabase
      .from('tkg_actions')
      .select('id, user_id, status, action_type, directive_text, artifact, execution_result')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message ?? JSON.stringify(error));
    }
    if (!action) {
      return NextResponse.json({ error: 'Action not found' }, { status: 404 });
    }
    if (action.status !== 'pending_approval') {
      return NextResponse.json({ error: 'Pending requirements packet required' }, { status: 409 });
    }
    if (!isDocumentCollectionRequirementsRecord(action)) {
      return NextResponse.json(
        { error: 'Document collection requirements packet required' },
        { status: 409 },
      );
    }

    const executionResult = asRecord(action.execution_result);
    const nextExecutionResult = {
      ...executionResult,
      document_collection_intake: {
        status: 'inputs_provided',
        captured_at: new Date().toISOString(),
        submission_url: input.submissionUrl,
        candidate_documents: input.candidateDocuments,
        next_action: DOCUMENT_COLLECTION_INTAKE_READY_NEXT_ACTION,
      },
    };

    const { error: updateError } = await supabase
      .from('tkg_actions')
      .update({ execution_result: nextExecutionResult })
      .eq('id', id)
      .eq('user_id', userId);

    if (updateError) {
      throw new Error(updateError.message ?? JSON.stringify(updateError));
    }

    return NextResponse.json({
      ok: true,
      action_id: id,
      intake_status: 'inputs_provided',
      next_action: DOCUMENT_COLLECTION_INTAKE_READY_NEXT_ACTION,
    });
  } catch (err: unknown) {
    return apiErrorForRoute(err, 'conviction/actions/[id]/document-collection-intake');
  }
}
