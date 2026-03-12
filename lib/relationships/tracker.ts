/**
 * Relationship Intelligence Tracker
 *
 * Analyzes email signals to compute relationship health metrics
 * and surfaces cooling relationships to the conviction engine.
 *
 * Called from sync-email after extraction completes.
 */

import { createServerClient } from '@/lib/db/client';


export interface RelationshipMetrics {
  name: string;
  email?: string;
  last_contact_date: string;
  avg_response_time_hours: number;
  total_interactions_30d: number;
  trend: 'increasing' | 'stable' | 'cooling';
}

/**
 * Analyze all email signals for a user, compute per-contact metrics,
 * and upsert relationship metadata into tkg_entities.
 */
export async function analyzeRelationships(userId: string): Promise<RelationshipMetrics[]> {
  const supabase = createServerClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  // Pull all email signals from the last 60 days for trend comparison
  const { data: signals } = await supabase
    .from('tkg_signals')
    .select('content, occurred_at, author, source')
    .eq('user_id', userId)
    .in('source', ['gmail', 'outlook', 'uploaded_document'])
    .gte('occurred_at', sixtyDaysAgo)
    .order('occurred_at', { ascending: false })
    .limit(500);

  if (!signals || signals.length === 0) return [];

  // Extract unique contacts from email content
  // Email signals follow format: "From: Name <email>\nSubject: ..."
  const contactMap = new Map<string, {
    name: string;
    email: string;
    interactions: Date[];
    interactions_30d: number;
    interactions_prior_30d: number;
  }>();

  for (const signal of signals) {
    const content = (signal.content as string) || '';
    const occurredAt = new Date(signal.occurred_at as string);

    // Extract "From: Name <email>" pattern
    const fromMatch = content.match(/From:\s*(.+?)\s*<([^>]+)>/);
    // Also check for "To: email" pattern in sent mail
    const toMatch = content.match(/To:\s*(.+?)\s*<([^>]+)>/);

    const contacts = [fromMatch, toMatch].filter(Boolean) as RegExpMatchArray[];

    for (const match of contacts) {
      const name = match[1].trim();
      const email = match[2].trim().toLowerCase();

      // Skip self / noreply addresses
      if (email.includes('noreply') || email.includes('no-reply') || email.includes('mailer-daemon')) continue;

      const key = email;
      if (!contactMap.has(key)) {
        contactMap.set(key, {
          name,
          email,
          interactions: [],
          interactions_30d: 0,
          interactions_prior_30d: 0,
        });
      }

      const entry = contactMap.get(key)!;
      entry.interactions.push(occurredAt);

      const thirtyDaysAgoDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      if (occurredAt >= thirtyDaysAgoDate) {
        entry.interactions_30d++;
      } else {
        entry.interactions_prior_30d++;
      }
    }
  }

  // Compute metrics for each contact
  const metrics: RelationshipMetrics[] = [];

  for (const [, contact] of contactMap) {
    if (contact.interactions.length < 2) continue; // Need at least 2 interactions for meaningful metrics

    // Sort interactions chronologically
    contact.interactions.sort((a, b) => a.getTime() - b.getTime());

    // Last contact
    const lastContact = contact.interactions[contact.interactions.length - 1];

    // Average response time (gap between consecutive interactions)
    let totalGapHours = 0;
    let gapCount = 0;
    for (let i = 1; i < contact.interactions.length; i++) {
      const gapMs = contact.interactions[i].getTime() - contact.interactions[i - 1].getTime();
      const gapHours = gapMs / (1000 * 60 * 60);
      if (gapHours < 720) { // Only count gaps < 30 days as meaningful
        totalGapHours += gapHours;
        gapCount++;
      }
    }
    const avgResponseHours = gapCount > 0 ? Math.round(totalGapHours / gapCount) : 0;

    // Trend: compare last 30 days vs prior 30 days
    let trend: 'increasing' | 'stable' | 'cooling';
    if (contact.interactions_prior_30d === 0 && contact.interactions_30d > 0) {
      trend = 'increasing';
    } else if (contact.interactions_prior_30d === 0 && contact.interactions_30d === 0) {
      trend = 'cooling';
    } else {
      const ratio = contact.interactions_30d / Math.max(contact.interactions_prior_30d, 1);
      if (ratio > 1.3) trend = 'increasing';
      else if (ratio < 0.7) trend = 'cooling';
      else trend = 'stable';
    }

    const metric: RelationshipMetrics = {
      name: contact.name,
      email: contact.email,
      last_contact_date: lastContact.toISOString(),
      avg_response_time_hours: avgResponseHours,
      total_interactions_30d: contact.interactions_30d,
      trend,
    };

    metrics.push(metric);

    // Upsert entity record with relationship metadata
    const { data: existing } = await supabase
      .from('tkg_entities')
      .select('id, patterns')
      .eq('user_id', userId)
      .eq('name', contact.name)
      .maybeSingle();

    const relationshipData = {
      last_contact: lastContact.toISOString(),
      response_time: avgResponseHours,
      interaction_count: contact.interactions_30d,
      trend,
    };

    if (existing) {
      const currentPatterns = (existing.patterns as Record<string, any>) ?? {};
      await supabase
        .from('tkg_entities')
        .update({
          last_interaction: lastContact.toISOString(),
          total_interactions: contact.interactions.length,
          patterns: {
            ...currentPatterns,
            _relationship_metrics: relationshipData,
          },
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('tkg_entities')
        .insert({
          user_id: userId,
          type: 'person',
          name: contact.name,
          display_name: contact.name,
          emails: [contact.email],
          last_interaction: lastContact.toISOString(),
          total_interactions: contact.interactions.length,
          patterns: { _relationship_metrics: relationshipData },
        });
    }
  }

  return metrics;
}

/**
 * Get top cooling relationships for injection into the conviction prompt.
 * Returns formatted string ready for CONVICTION_SYSTEM.
 */
export async function getCoolingRelationships(userId: string, limit = 5): Promise<string> {
  const supabase = createServerClient();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: entities } = await supabase
    .from('tkg_entities')
    .select('name, last_interaction, total_interactions, patterns')
    .eq('user_id', userId)
    .neq('name', 'self')
    .lt('last_interaction', fourteenDaysAgo)
    .order('last_interaction', { ascending: true })
    .limit(limit);

  if (!entities || entities.length === 0) return '';

  const lines = entities.map((e: any) => {
    const days = Math.floor((Date.now() - new Date(e.last_interaction).getTime()) / (1000 * 60 * 60 * 24));
    const metrics = (e.patterns as Record<string, any>)?._relationship_metrics;
    const trend = metrics?.trend || 'unknown';
    return `• ${e.name}: last contact ${days} days ago (trend: ${trend}, ${e.total_interactions} total interactions)`;
  });

  return `\nCOOLING RELATIONSHIPS (declining engagement — consider reaching out):
${lines.join('\n')}`;
}
