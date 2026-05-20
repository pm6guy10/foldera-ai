import { NextResponse } from 'next/server';
import { resolveUser } from '@/lib/auth/resolve-user';
import { createServerClient } from '@/lib/db/client';
import { normalizeWorkdayPresenceState } from '@/lib/workday-presence/model';
import { apiErrorForRoute, badRequest } from '@/lib/utils/api-error';
import type { SimulatedConnectorEvidenceEvent } from '@/lib/connectors/test-mode/evidence-adapters';
import { ingestSimulatedConnectorEvidenceOnce } from '@/lib/connectors/test-mode/ingest';

export const dynamic = 'force-dynamic';

type IngestRequestBody = {
  events?: SimulatedConnectorEvidenceEvent[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseEvents(value: unknown): SimulatedConnectorEvidenceEvent[] | null {
  if (!Array.isArray(value)) return null;
  // This is test-mode only; keep validation minimal but safe.
  const events: SimulatedConnectorEvidenceEvent[] = [];
  for (const raw of value) {
    if (!isObject(raw)) return null;
    const kind = raw.kind;
    if (kind !== 'gmail' && kind !== 'calendar' && kind !== 'slack') return null;
    events.push(raw as SimulatedConnectorEvidenceEvent);
  }
  return events;
}

export async function POST(request: Request) {
  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const payload = (await request.json().catch(() => ({}))) as IngestRequestBody;
    const events = parseEvents(payload.events);
    if (!events) {
      return badRequest('Invalid ingest payload: events[] required');
    }

    const supabase = createServerClient();
    const { data, error } = await supabase.auth.admin.getUserById(auth.userId);
    if (error) throw error;

    const metadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const state = normalizeWorkdayPresenceState(metadata.workday_presence_state);
    const result = ingestSimulatedConnectorEvidenceOnce(events, state);

    return NextResponse.json({ result });
  } catch (error: unknown) {
    return apiErrorForRoute(error, 'connectors test-mode ingest POST');
  }
}

