import { createServerClient } from '@/lib/db/client';
import {
  detectSystemSenderReason,
  type TrustClass,
} from '@/lib/signals/entity-trust';

export interface PollutedEntityFinding {
  id: string;
  name: string;
  trust_class: TrustClass | null;
  primary_email: string | null;
  reason: string;
}

export interface EntityTrustRepairResult {
  ok: boolean;
  scanned: number;
  polluted_entities: PollutedEntityFinding[];
  repaired: number;
}

interface EntityRow {
  id: string;
  name: string | null;
  display_name: string | null;
  company: string | null;
  trust_class: TrustClass | null;
  primary_email: string | null;
  emails: string[] | null;
  patterns: Record<string, unknown> | null;
}

function findPollutionReason(
  entity: EntityRow,
  selfEmails?: Set<string>,
): string | null {
  const emailCandidates = [entity.primary_email, ...(entity.emails ?? [])];
  for (const email of emailCandidates) {
    const reason = detectSystemSenderReason({
      email,
      displayName: entity.display_name ?? entity.name,
      company: entity.company,
      selfEmails,
    });
    if (reason) return reason;
  }

  return detectSystemSenderReason({
    email: null,
    displayName: entity.display_name ?? entity.name,
    company: entity.company,
    selfEmails,
  });
}

export async function findPollutedTrustedEntities(
  userId: string,
  options: { selfEmails?: Set<string>; limit?: number } = {},
): Promise<PollutedEntityFinding[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('tkg_entities')
    .select('id, name, display_name, company, trust_class, primary_email, emails, patterns')
    .eq('user_id', userId)
    .eq('type', 'person')
    .neq('name', 'self')
    .in('trust_class', ['trusted', 'unclassified', 'personal'])
    .limit(options.limit ?? 400);

  if (error) {
    throw new Error(`polluted_entity_scan: ${error.message}`);
  }

  return (data ?? [])
    .map((row) => {
      const entity = row as unknown as EntityRow;
      const reason = findPollutionReason(entity, options.selfEmails);
      if (!reason) return null;
      return {
        id: entity.id,
        name: entity.display_name ?? entity.name ?? entity.id,
        trust_class: entity.trust_class,
        primary_email: entity.primary_email,
        reason,
      } satisfies PollutedEntityFinding;
    })
    .filter((row): row is PollutedEntityFinding => Boolean(row));
}

export async function repairPollutedTrustedEntities(
  userId: string,
  options: { selfEmails?: Set<string>; limit?: number } = {},
): Promise<EntityTrustRepairResult> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('tkg_entities')
    .select('id, name, display_name, company, trust_class, primary_email, emails, patterns')
    .eq('user_id', userId)
    .eq('type', 'person')
    .neq('name', 'self')
    .in('trust_class', ['trusted', 'unclassified', 'personal'])
    .limit(options.limit ?? 400);

  if (error) {
    throw new Error(`polluted_entity_repair_scan: ${error.message}`);
  }

  let repaired = 0;
  const pollutedEntities: PollutedEntityFinding[] = [];

  for (const row of (data ?? []) as unknown as EntityRow[]) {
    const reason = findPollutionReason(row, options.selfEmails);
    if (!reason) continue;

    pollutedEntities.push({
      id: row.id,
      name: row.display_name ?? row.name ?? row.id,
      trust_class: row.trust_class,
      primary_email: row.primary_email,
      reason,
    });

    const trustRepair = {
      repaired_at: new Date().toISOString(),
      previous_trust_class: row.trust_class ?? 'unclassified',
      reason,
    };
    const patterns = { ...(row.patterns ?? {}), trust_repair: trustRepair };

    const { error: updateError } = await supabase
      .from('tkg_entities')
      .update({
        trust_class: 'transactional',
        patterns,
        patterns_updated_at: trustRepair.repaired_at,
      })
      .eq('id', row.id);

    if (updateError) {
      throw new Error(`polluted_entity_repair_update:${row.id}:${updateError.message}`);
    }

    repaired++;
  }

  return {
    ok: true,
    scanned: data?.length ?? 0,
    polluted_entities: pollutedEntities,
    repaired,
  };
}
