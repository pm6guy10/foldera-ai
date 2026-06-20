import { createServerClient } from '@/lib/db/client';
import { decryptWithStatus, looksLikeEncryptedPayload } from '@/lib/encryption';
import {
  detectSystemSenderReason,
  type TrustClass,
} from '@/lib/signals/entity-trust';
import { extractRecipientEmails } from '@/lib/signals/signal-processor';

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

export interface TrustDemotionResult {
  ok: boolean;
  scanned: number;
  outbound_recipients: number;
  demoted: number;
  confirmed: number;
}

/**
 * Demote legacy `trusted` entities that never earned it.
 *
 * Historical classification granted `trusted` to any sender after one inbound
 * email, which is how personal contacts, spammers, and transactional senders
 * became top "work" entities. Under current doctrine trust requires outbound
 * evidence (the user wrote TO the person). This sweep rebuilds that evidence
 * from sent-mail signals and demotes trusted entities that have none to
 * `unclassified` — they re-earn `trusted` the moment the user actually
 * writes to them.
 */
export async function demoteUnprovenTrustedEntities(
  userId: string,
  options: { selfEmails?: Set<string>; entityLimit?: number; sentSignalLimit?: number } = {},
): Promise<TrustDemotionResult> {
  const supabase = createServerClient();

  const sentSignals = await supabase
    .from('tkg_signals')
    .select('content')
    .eq('user_id', userId)
    .eq('type', 'email_sent')
    .order('occurred_at', { ascending: false })
    .limit(options.sentSignalLimit ?? 2000);

  if (sentSignals.error) {
    throw new Error(`trust_demotion_sent_scan: ${sentSignals.error.message}`);
  }

  const outboundRecipients = new Set<string>();
  for (const row of sentSignals.data ?? []) {
    const rawContent = row.content as string;
    const { plaintext, usedFallback } = decryptWithStatus(rawContent);
    // #481 FORMAT GAP: keep readable plaintext sent rows; skip only ciphertext.
    if (usedFallback && looksLikeEncryptedPayload(rawContent)) continue;
    for (const email of extractRecipientEmails(plaintext)) {
      outboundRecipients.add(email);
    }
  }

  const entities = await supabase
    .from('tkg_entities')
    .select('id, name, display_name, trust_class, primary_email, emails, patterns')
    .eq('user_id', userId)
    .eq('type', 'person')
    .eq('trust_class', 'trusted')
    .neq('name', 'self')
    .limit(options.entityLimit ?? 400);

  if (entities.error) {
    throw new Error(`trust_demotion_entity_scan: ${entities.error.message}`);
  }

  let demoted = 0;
  let confirmed = 0;
  const now = new Date().toISOString();

  for (const row of (entities.data ?? []) as unknown as EntityRow[]) {
    const patterns = (row.patterns ?? {}) as Record<string, unknown>;
    const evidence = patterns.trust_evidence as { outbound?: boolean } | undefined;
    if (evidence?.outbound === true) {
      confirmed++;
      continue;
    }

    const entityEmails = [row.primary_email, ...(row.emails ?? [])]
      .map((e) => (e ?? '').trim().toLowerCase())
      .filter(Boolean);
    const selfEmails = options.selfEmails ?? new Set<string>();
    const hasOutbound = entityEmails.some(
      (email) => outboundRecipients.has(email) && !selfEmails.has(email),
    );

    if (hasOutbound) {
      // Stamp the evidence so future sweeps skip this entity.
      const { error: stampError } = await supabase
        .from('tkg_entities')
        .update({
          patterns: { ...patterns, trust_evidence: { outbound: true, at: now } },
          patterns_updated_at: now,
        })
        .eq('id', row.id);
      if (stampError) {
        throw new Error(`trust_demotion_stamp:${row.id}:${stampError.message}`);
      }
      confirmed++;
      continue;
    }

    const { error: demoteError } = await supabase
      .from('tkg_entities')
      .update({
        trust_class: 'unclassified',
        patterns: {
          ...patterns,
          trust_repair: {
            repaired_at: now,
            previous_trust_class: row.trust_class ?? 'trusted',
            reason: 'no_outbound_evidence',
          },
        },
        patterns_updated_at: now,
      })
      .eq('id', row.id);

    if (demoteError) {
      throw new Error(`trust_demotion_update:${row.id}:${demoteError.message}`);
    }
    demoted++;
  }

  return {
    ok: true,
    scanned: entities.data?.length ?? 0,
    outbound_recipients: outboundRecipients.size,
    demoted,
    confirmed,
  };
}
