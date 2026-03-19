/**
 * Signal Processor
 *
 * Runs before directive generation in daily-generate. Takes unprocessed
 * tkg_signals (from Microsoft/Google sync), batches them in groups of 5,
 * and calls Claude Haiku to extract:
 *   - Person names → upsert tkg_entities
 *   - Commitments  → insert tkg_commitments
 *   - Key topics   → merge into tkg_entities.patterns (self entity)
 *
 * After extraction, marks each signal processed=true with extracted_entity_ids
 * and extracted_commitment_ids populated.
 *
 * Fetches up to 5 signals per batch invocation (Hobby tier 10s limit).
 * Called on every Regenerate click and daily cron run.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/db/client';
import { decryptWithStatus, encrypt } from '@/lib/encryption';
import { recoverMicrosoftSignalContent } from '@/lib/sync/microsoft-sync';
import { trackApiCall } from '@/lib/utils/api-tracker';
import { isOverDailyLimit } from '@/lib/utils/api-tracker';
import { logStructuredEvent } from '@/lib/utils/structured-logger';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const BATCH_SIZE = 5;
const DEFAULT_MAX_SIGNALS = 5;
const MAX_WARNING_LOGS = 5;

// Sources that write raw signals without entity extraction
export const EXTRACTABLE_SOURCES = [
  'outlook', 'gmail', 'outlook_calendar', 'google_calendar',
  'onedrive', 'microsoft_todo', 'notion', 'drive', 'dropbox', 'slack',
];

interface RawSignal {
  id: string;
  user_id: string;
  source: string;
  source_id: string | null;
  type: string;
  content: string;
  author: string | null;
  occurred_at: string | null;
}

interface ExtractedPerson {
  name: string;
  email?: string;
  role?: string;
  company?: string;
}

interface ExtractedCommitment {
  description: string;
  who: string;       // person name — promisor
  to_whom?: string;  // promisee
  due?: string;      // due date string if mentioned
  category: string;
}

interface ExtractedTopic {
  name: string;
  domain: string;
}

interface SignalExtraction {
  signal_id: string;
  persons: ExtractedPerson[];
  commitments: ExtractedCommitment[];
  topics: ExtractedTopic[];
}

interface ProcessResult {
  signals_processed: number;
  entities_upserted: number;
  commitments_created: number;
  topics_merged: number;
  deferred_signal_ids: string[];
  errors: string[];
}

export interface ProcessSignalsOptions {
  maxSignals?: number;
  pauseMsBetweenBatches?: number;
  createdAtGte?: string;
  prioritizeOlderThanIso?: string;
  quarantineDeferredOlderThanIso?: string;
}

export interface SignalQueryOptions {
  createdAtGte?: string;
}

const EXTRACTION_PROMPT = `You are extracting structured data from raw signals (emails, calendar events, files, tasks) for a personal chief of staff system.

For each signal in the batch, extract:

1. **persons** — every person mentioned by name. Include email if visible, role/title if stated, company if stated. Do NOT include the user themselves.
2. **commitments** — promises, deadlines, action items. "I'll send the deck by Friday", "Meeting with Sarah at 3pm", "Review the proposal". Include who made the commitment and to whom.
3. **topics** — key themes or subjects (e.g. "Q2 budget review", "product launch", "hiring"). Keep to 1-3 per signal.

Return JSON matching this schema exactly:
[
  {
    "signal_id": "the signal ID from input",
    "persons": [
      { "name": "string", "email": "string|null", "role": "string|null", "company": "string|null" }
    ],
    "commitments": [
      { "description": "string", "who": "person name", "to_whom": "person name|null", "due": "date string|null", "category": "deliver_document|schedule_meeting|provide_information|make_decision|follow_up|review_approve|payment_financial|attend_participate|other" }
    ],
    "topics": [
      { "name": "string", "domain": "career|finances|relationships|health|project|other" }
    ]
  }
]

Extract only what is explicit or clearly implied. If a signal has nothing to extract, return empty arrays for that signal. Always return one object per signal_id.`;

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  return new Anthropic({ apiKey });
}

/**
 * Process unextracted signals for a user. Call before generateDirective().
 */
export async function processUnextractedSignals(
  userId: string,
  options: ProcessSignalsOptions = {},
): Promise<ProcessResult> {
  const result: ProcessResult = {
    signals_processed: 0,
    entities_upserted: 0,
    commitments_created: 0,
    topics_merged: 0,
    deferred_signal_ids: [],
    errors: [],
  };

  const maxSignals = Math.max(0, Math.floor(options.maxSignals ?? DEFAULT_MAX_SIGNALS));
  const pauseMsBetweenBatches = Math.max(0, Math.floor(options.pauseMsBetweenBatches ?? 0));

  if (maxSignals === 0) {
    return result;
  }

  // Check daily spend cap before any API calls
  try {
    if (await isOverDailyLimit(userId)) {
      return result;
    }
  } catch (err: unknown) {
    result.errors.push(`spend_cap: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  const supabase = createServerClient();

  // Get or create self entity for pattern merging
  const selfEntityResult = await supabase
    .from('tkg_entities')
    .select('id, patterns')
    .eq('user_id', userId)
    .eq('name', 'self')
    .maybeSingle();

  if (selfEntityResult.error) {
    result.errors.push(`self_entity_fetch: ${selfEntityResult.error.message}`);
    return result;
  }

  let selfEntity = selfEntityResult.data;
  if (!selfEntity) {
    const createSelfResult = await supabase
      .from('tkg_entities')
      .insert({ user_id: userId, type: 'person', name: 'self', display_name: 'You', emails: [], patterns: {} })
      .select('id, patterns')
      .single();

    if (createSelfResult.error) {
      result.errors.push(`self_entity_create: ${createSelfResult.error.message}`);
      return result;
    }

    selfEntity = createSelfResult.data;
  }

  const selfId = selfEntity?.id;
  const anthropic = getAnthropicClient();
  const deferredSignalIds = new Set<string>();

  while (result.signals_processed < maxSignals) {
    const remaining = maxSignals - result.signals_processed;
    const fetchLimit = Math.min(BATCH_SIZE, remaining);
    const queryLimit = Math.min(1000, fetchLimit + deferredSignalIds.size + BATCH_SIZE);
    const prioritizeOldestFirst = options.prioritizeOlderThanIso
      ? await hasUnprocessedSignalsOlderThan(userId, options.prioritizeOlderThanIso, options)
      : false;
    let signalsQuery = supabase
      .from('tkg_signals')
      .select('id, user_id, source, source_id, type, content, author, occurred_at')
      .eq('user_id', userId)
      .eq('processed', false)
      .in('source', EXTRACTABLE_SOURCES)
      .order('occurred_at', { ascending: prioritizeOldestFirst });

    if (options.createdAtGte) {
      signalsQuery = signalsQuery.gte('created_at', options.createdAtGte);
    }

    const signalsResult = await signalsQuery.limit(queryLimit);

    if (signalsResult.error) {
      result.errors.push(`fetch: ${signalsResult.error.message}`);
      break;
    }

    const signals = (signalsResult.data ?? [])
      .filter((signal) => !deferredSignalIds.has(signal.id))
      .slice(0, fetchLimit);
    if (signals.length === 0) {
      break;
    }

    try {
      const batchResult = await processBatch(anthropic, supabase, signals, userId, selfId, selfEntity?.patterns);
      const quarantinedDeferredSignalIds = await quarantineDeferredSignals(
        supabase,
        userId,
        signals,
        batchResult.deferred_signal_ids,
        options.quarantineDeferredOlderThanIso,
      );
      const unresolvedDeferredSignalIds = batchResult.deferred_signal_ids
        .filter((signalId) => !quarantinedDeferredSignalIds.includes(signalId));

      result.signals_processed += batchResult.signals_processed;
      result.entities_upserted += batchResult.entities_upserted;
      result.commitments_created += batchResult.commitments_created;
      result.topics_merged += batchResult.topics_merged;
      result.deferred_signal_ids.push(...unresolvedDeferredSignalIds);
      result.errors.push(...batchResult.errors);
      if (quarantinedDeferredSignalIds.length > 0) {
        result.errors.push(`quarantined: ${quarantinedDeferredSignalIds.length} stale undecryptable signal(s)`);
      }

      for (const signalId of unresolvedDeferredSignalIds) {
        deferredSignalIds.add(signalId);
      }

      if (batchResult.topics_merged > 0 && selfId) {
        const refreshedPatternsResult = await supabase
          .from('tkg_entities')
          .select('patterns')
          .eq('id', selfId)
          .maybeSingle();

        if (refreshedPatternsResult.error) {
          result.errors.push(`self_patterns_refresh: ${refreshedPatternsResult.error.message}`);
          break;
        }

        if (refreshedPatternsResult.data) {
          selfEntity = {
            ...selfEntity,
            patterns: refreshedPatternsResult.data.patterns,
          };
        }
      }

      if (batchResult.signals_processed === 0) {
        if (unresolvedDeferredSignalIds.length > 0) {
          continue;
        }
        break;
      }
    } catch (batchErr: unknown) {
      const message = batchErr instanceof Error ? batchErr.message : String(batchErr);
      result.errors.push(`batch: ${message}`);
      logStructuredEvent({
        event: 'signal_processor_batch_failed',
        level: 'warn',
        userId,
        artifactType: null,
        generationStatus: 'batch_failed',
        details: {
          scope: 'signal-processor',
          error: message,
        },
      });
      break;
    }

    if (pauseMsBetweenBatches > 0 && result.signals_processed < maxSignals) {
      await sleep(pauseMsBetweenBatches);
    }
  }

  return result;
}

/**
 * Returns true if the signal was sent by Foldera itself (brief@foldera.ai or
 * any @foldera.ai address). These signals should not produce commitments or
 * entities to prevent the self-referential loop where directives become
 * commitments that generate future directives about themselves.
 */
function isFolderaSender(author: string | null | undefined, content: string | null | undefined): boolean {
  const authorLower = (author ?? '').toLowerCase();
  if (authorLower.includes('@foldera.ai') || authorLower.includes('foldera')) return true;

  // Also check email content for Foldera sender in From/To lines
  const contentLower = (content ?? '').toLowerCase();
  if (/\bfrom:\s*[^\n]*@foldera\.ai\b/.test(contentLower)) return true;
  if (/\[sent email:/.test(contentLower) && /\bto:\s*[^\n]*@foldera\.ai\b/.test(contentLower)) return false; // user sending TO foldera is fine
  if (/\[foldera\b/.test(contentLower)) return true; // [Foldera Directive or [Foldera · prefix

  return false;
}

/**
 * Filters out extracted "commitments" that aren't real commitments in the
 * product sense. A real commitment is a promise the user made to another
 * person or a professional deliverable with a named recipient.
 *
 * Rejects: calendar events without external recipients, bill/payment reminders,
 * automated notifications, personal errands, system-generated emails.
 */
const NON_COMMITMENT_PATTERNS = [
  // Calendar events and appointments (personal, no external recipient)
  /\b(appointment|counseling|therapy|doctor|dentist|haircut|pickup|drop.?off|grocery|errand)\b/i,
  // Automated billing and payment notifications
  /\b(bill\s*payment|payment\s*(?:due|reminder)|auto.?pay|statement\s*(?:ready|available)|account\s*(?:ending|balance)|amount\s*due)\b/i,
  // System-generated / automated emails
  /\b(no.?reply|noreply|automated|unsubscribe|do.?not.?reply|data\s*export|will\s*be\s*emailed\s*when\s*ready)\b/i,
  // Personal errands
  /\b(pizza|dinner|lunch|breakfast|groceries|laundry|cleaning|oil\s*change|car\s*wash)\b/i,
  // Generic calendar event titles without a person
  /^(meeting|event|reminder|call|check.?in)$/i,
  // Feedback/survey requests from services
  /\b(provide\s*feedback|rate\s*(?:your|our)|how\s*was\s*your|survey|experience\s*(?:for|with))\b/i,
];

function isNonCommitment(description: string): boolean {
  return NON_COMMITMENT_PATTERNS.some((pattern) => pattern.test(description));
}

async function processBatch(
  anthropic: Anthropic,
  supabase: ReturnType<typeof createServerClient>,
  batch: RawSignal[],
  userId: string,
  selfId: string | undefined,
  selfPatterns: Record<string, any> | undefined,
): Promise<ProcessResult> {
  const result: ProcessResult = {
    signals_processed: 0,
    entities_upserted: 0,
    commitments_created: 0,
    topics_merged: 0,
    deferred_signal_ids: [],
    errors: [],
  };

  // Build prompt with decrypted signal content, skipping signals that are still ciphertext
  const decryptedBatch: RawSignal[] = [];
  const signalTexts: string[] = [];
  let decryptWarningCount = 0;

  for (const s of batch) {
    const decrypted = decryptWithStatus(s.content);
    let content = decrypted.plaintext;

    if (decrypted.usedFallback && isMicrosoftRecoverableSignal(s)) {
      try {
        const recoveredContent = await recoverAndReencryptMicrosoftSignal(supabase, userId, s);
        if (recoveredContent) {
          content = recoveredContent;
        }
      } catch (error: unknown) {
        if (decryptWarningCount < MAX_WARNING_LOGS) {
          logStructuredEvent({
            event: 'signal_processor_microsoft_recovery_failed',
            level: 'warn',
            userId,
            artifactType: null,
            generationStatus: 'recovery_failed',
            details: {
              scope: 'signal-processor',
              signal_source: s.source,
              error: error instanceof Error ? error.message : String(error),
            },
          });
          decryptWarningCount++;
        }
      }
    }

    if (looksLikeCiphertext(content)) {
      // Skip undecryptable ciphertext so it can be retried once the correct key or source recovery is available.
      result.deferred_signal_ids.push(s.id);
      if (decryptWarningCount < MAX_WARNING_LOGS) {
        logStructuredEvent({
          event: 'signal_processor_ciphertext_skipped',
          level: 'warn',
          userId,
          artifactType: null,
          generationStatus: 'ciphertext_skipped',
          details: {
            scope: 'signal-processor',
            signal_source: s.source,
          },
        });
        decryptWarningCount++;
      }
      continue;
    }

    decryptedBatch.push(s);
    const trimmed = content.length > 2000 ? content.slice(0, 2000) + '...' : content;
    signalTexts.push(`--- Signal ID: ${s.id} | Source: ${s.source} | Type: ${s.type} ---\n${trimmed}`);
  }

  // If all signals were ciphertext, nothing to extract
  if (decryptedBatch.length === 0) {
    result.errors.push('decrypt: no decryptable signals in batch');
    return result;
  }

  const promptText = signalTexts.join('\n\n');

  const response = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 2048,
    temperature: 0,
    system: EXTRACTION_PROMPT,
    messages: [{ role: 'user', content: promptText }],
  });

  // Track API cost
  await trackApiCall({
    userId,
    model: HAIKU_MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    callType: 'signal_extraction',
  });

  const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
  let extractions: SignalExtraction[] = [];
  try {
    const cleaned = rawText.replace(/```json\n?|\n?```/g, '').trim();
    extractions = JSON.parse(cleaned);
    if (!Array.isArray(extractions)) extractions = [];
  } catch (error: unknown) {
    result.errors.push(`parse: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }

  // Build lookup for fast access
  const extractionMap = new Map<string, SignalExtraction>();
  for (const ex of extractions) {
    if (ex.signal_id) extractionMap.set(ex.signal_id, ex);
  }

  // Collect all topics for a single patterns merge at end of batch
  const allTopics: ExtractedTopic[] = [];

  for (const signal of decryptedBatch) {
    const extraction = extractionMap.get(signal.id);
    const entityIds: string[] = [];
    const commitmentIds: string[] = [];

    // Skip commitment and entity extraction for Foldera's own sent emails.
    // These signals are kept for engagement tracking but must not produce
    // commitments or entities — otherwise directives become commitments
    // that generate future directives about themselves (self-referential loop).
    const isFolderaEmail = isFolderaSender(signal.author, signal.content);

    if (extraction && !isFolderaEmail) {
      // Upsert persons → tkg_entities
      for (const person of extraction.persons ?? []) {
        if (!person.name?.trim()) continue;
        const entityId = await upsertEntity(supabase, userId, person);
        if (entityId) {
          entityIds.push(entityId);
          result.entities_upserted++;
        }
      }

      // Insert commitments → tkg_commitments (with quality filter)
      for (const commitment of extraction.commitments ?? []) {
        if (!commitment.description?.trim()) continue;
        if (isNonCommitment(commitment.description)) continue;
        const commitmentId = await insertCommitment(
          supabase, userId, selfId, commitment, signal.id, entityIds,
        );
        if (commitmentId) {
          commitmentIds.push(commitmentId);
          result.commitments_created++;
        }
      }

      // Collect topics
      for (const topic of extraction.topics ?? []) {
        if (topic.name?.trim()) {
          allTopics.push(topic);
        }
      }
    }

    const extractedDates = extraction
      ? (extraction.commitments ?? [])
          .filter(c => c.due)
          .map(c => ({ description: c.description, due: c.due }))
      : [];

    // Mark signal processed with extracted data persisted to columns
    const updateSignalResult = await supabase
      .from('tkg_signals')
      .update({
        processed: true,
        extracted_entities: entityIds.length > 0 ? entityIds : [],
        extracted_commitments: commitmentIds.length > 0 ? commitmentIds : [],
        extracted_dates: extractedDates.length > 0 ? extractedDates : null,
      })
      .eq('id', signal.id);

    if (updateSignalResult.error) {
      throw new Error(`signal_update: ${updateSignalResult.error.message}`);
    }

    result.signals_processed++;
  }

  // Merge topics into self entity patterns
  if (allTopics.length > 0 && selfId) {
    const merged = { ...(selfPatterns ?? {}) };
    for (const topic of allTopics) {
      const key = topic.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60);
      merged[key] = {
        name: topic.name,
        description: `Topic from synced signals`,
        domain: topic.domain || 'other',
        last_seen: new Date().toISOString(),
        activation_count: ((merged[key]?.activation_count as number) || 0) + 1,
      };
    }
    const updatePatternsResult = await supabase
      .from('tkg_entities')
      .update({ patterns: merged, patterns_updated_at: new Date().toISOString() })
      .eq('id', selfId);

    if (updatePatternsResult.error) {
      throw new Error(`patterns_update: ${updatePatternsResult.error.message}`);
    }

    result.topics_merged = allTopics.length;
  }

  return result;
}

function isMicrosoftRecoverableSignal(
  signal: RawSignal,
): signal is RawSignal & { source: 'outlook' | 'outlook_calendar'; source_id: string } {
  return (
    (signal.source === 'outlook' || signal.source === 'outlook_calendar') &&
    typeof signal.source_id === 'string' &&
    signal.source_id.length > 0
  );
}

async function recoverAndReencryptMicrosoftSignal(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  signal: RawSignal & { source: 'outlook' | 'outlook_calendar'; source_id: string },
): Promise<string | null> {
  const recoveredContent = await recoverMicrosoftSignalContent(
    userId,
    signal.source,
    signal.source_id,
    signal.type,
  );

  if (!recoveredContent) {
    return null;
  }

  const updateResult = await supabase
    .from('tkg_signals')
    .update({ content: encrypt(recoveredContent) })
    .eq('id', signal.id)
    .eq('processed', false);

  if (updateResult.error) {
    throw new Error(`signal_reencrypt: ${updateResult.error.message}`);
  }

  logStructuredEvent({
    event: 'signal_processor_microsoft_signal_recovered',
    level: 'info',
    userId,
    artifactType: null,
    generationStatus: 'signal_recovered',
    details: {
      scope: 'signal-processor',
      signal_source: signal.source,
    },
  });

  return recoveredContent;
}

async function upsertEntity(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  person: ExtractedPerson,
): Promise<string | null> {
  const name = person.name.trim();
  const nameLower = name.toLowerCase();

  // Check if entity already exists (case-insensitive match on name)
  const existingResult = await supabase
    .from('tkg_entities')
    .select('id, emails, total_interactions, last_interaction')
    .eq('user_id', userId)
    .ilike('name', nameLower)
    .maybeSingle();

  if (existingResult.error) {
    throw new Error(`entity_lookup: ${existingResult.error.message}`);
  }

  const existing = existingResult.data;

  if (existing) {
    // Update interaction count and merge email if new
    const updates: Record<string, any> = {
      total_interactions: (existing.total_interactions ?? 0) + 1,
      last_interaction: new Date().toISOString(),
    };
    if (person.email && !(existing.emails ?? []).includes(person.email)) {
      updates.emails = [...(existing.emails ?? []), person.email];
      updates.primary_email = existing.emails?.length ? existing.emails[0] : person.email;
    }
    if (person.role) updates.role = person.role;
    if (person.company) updates.company = person.company;

    const updateEntityResult = await supabase.from('tkg_entities').update(updates).eq('id', existing.id);
    if (updateEntityResult.error) {
      throw new Error(`entity_update: ${updateEntityResult.error.message}`);
    }
    return existing.id;
  }

  // Insert new entity
  const createEntityResult = await supabase
    .from('tkg_entities')
    .insert({
      user_id: userId,
      type: 'person',
      name: nameLower,
      display_name: name,
      emails: person.email ? [person.email] : [],
      primary_email: person.email ?? null,
      role: person.role ?? null,
      company: person.company ?? null,
      patterns: {},
      total_interactions: 1,
      last_interaction: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (createEntityResult.error) {
    // Likely unique constraint or race condition — not fatal
    logStructuredEvent({
      event: 'signal_processor_entity_insert_failed',
      level: 'warn',
      userId,
      artifactType: null,
      generationStatus: 'entity_insert_failed',
      details: {
        scope: 'signal-processor',
        error: createEntityResult.error.message,
      },
    });
    return null;
  }
  return createEntityResult.data?.id ?? null;
}

async function insertCommitment(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  selfId: string | undefined,
  commitment: ExtractedCommitment,
  signalId: string,
  entityIds: string[],
): Promise<string | null> {
  // Try to find the promisor entity; fall back to self
  let promisorId = selfId ?? null;
  if (commitment.who) {
    const promisorResult = await supabase
      .from('tkg_entities')
      .select('id')
      .eq('user_id', userId)
      .ilike('name', commitment.who.toLowerCase())
      .maybeSingle();
    if (promisorResult.error) {
      throw new Error(`promisor_lookup: ${promisorResult.error.message}`);
    }
    if (promisorResult.data) promisorId = promisorResult.data.id;
  }

  // Try to find the promisee entity; fall back to self
  let promiseeId = selfId ?? null;
  if (commitment.to_whom) {
    const promiseeResult = await supabase
      .from('tkg_entities')
      .select('id')
      .eq('user_id', userId)
      .ilike('name', commitment.to_whom.toLowerCase())
      .maybeSingle();
    if (promiseeResult.error) {
      throw new Error(`promisee_lookup: ${promiseeResult.error.message}`);
    }
    if (promiseeResult.data) promiseeId = promiseeResult.data.id;
  }

  // Dedup by canonical form
  const canonical = `SYNC:${commitment.category}:${commitment.description.slice(0, 60).replace(/\s+/g, '_')}`;
  const existingCommitmentResult = await supabase
    .from('tkg_commitments')
    .select('id')
    .eq('user_id', userId)
    .eq('canonical_form', canonical)
    .maybeSingle();

  if (existingCommitmentResult.error) {
    throw new Error(`commitment_lookup: ${existingCommitmentResult.error.message}`);
  }

  if (existingCommitmentResult.data) return existingCommitmentResult.data.id;

  const createCommitmentResult = await supabase
    .from('tkg_commitments')
    .insert({
      user_id: userId,
      promisor_id: promisorId,
      promisee_id: promiseeId,
      description: commitment.description,
      canonical_form: canonical,
      category: commitment.category || 'other',
      made_at: new Date().toISOString(),
      due_at: commitment.due ? new Date(commitment.due).toISOString() : null,
      source: 'signal_extraction',
      source_id: signalId,
      status: 'active',
      risk_score: 0,
    })
    .select('id')
    .single();

  if (createCommitmentResult.error) {
    logStructuredEvent({
      event: 'signal_processor_commitment_insert_failed',
      level: 'warn',
      userId,
      artifactType: null,
      generationStatus: 'commitment_insert_failed',
      details: {
        scope: 'signal-processor',
        error: createCommitmentResult.error.message,
      },
    });
    return null;
  }

  // A new signal arrived for this entity — unsuppress any previously
  // suppressed commitments from the same promisor so the scorer can
  // re-evaluate them with fresh context.
  if (promisorId) {
    await supabase
      .from('tkg_commitments')
      .update({ suppressed_at: null, suppressed_reason: null })
      .eq('user_id', userId)
      .eq('promisor_id', promisorId)
      .not('suppressed_at', 'is', null);
  }

  return createCommitmentResult.data?.id ?? null;
}

/**
 * Detects whether a string is still AES-256-GCM ciphertext (base64-encoded,
 * no spaces, no natural language). Used to catch cases where decrypt() fell
 * through because ENCRYPTION_KEY was missing or wrong.
 */
function looksLikeCiphertext(content: string): boolean {
  // Natural language has spaces; ciphertext base64 never does
  if (content.includes(' ')) return false;
  // Must be long enough to be IV + Tag + at least 1 byte of ciphertext (29+ base64 chars)
  if (content.length < 40) return false;
  // Base64 pattern: only A-Z, a-z, 0-9, +, /, = and no whitespace
  return /^[A-Za-z0-9+/=]+$/.test(content);
}

async function hasUnprocessedSignalsOlderThan(
  userId: string,
  beforeIso: string,
  options: SignalQueryOptions = {},
): Promise<boolean> {
  const supabase = createServerClient();
  let query = supabase
    .from('tkg_signals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('processed', false)
    .in('source', EXTRACTABLE_SOURCES)
    .lt('occurred_at', beforeIso);

  if (options.createdAtGte) {
    query = query.gte('created_at', options.createdAtGte);
  }

  const countResult = await query;
  if (countResult.error) {
    throw new Error(`signal_stale_count: ${countResult.error.message}`);
  }

  return (countResult.count ?? 0) > 0;
}

async function quarantineDeferredSignals(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  signals: RawSignal[],
  deferredSignalIds: string[],
  quarantineOlderThanIso?: string,
): Promise<string[]> {
  if (!quarantineOlderThanIso || deferredSignalIds.length === 0) {
    return [];
  }

  const staleDeferredSignalIds = signals
    .filter((signal) =>
      deferredSignalIds.includes(signal.id) &&
      typeof signal.occurred_at === 'string' &&
      signal.occurred_at < quarantineOlderThanIso,
    )
    .map((signal) => signal.id);

  if (staleDeferredSignalIds.length === 0) {
    return [];
  }

  const quarantineResult = await supabase
    .from('tkg_signals')
    .update({
      processed: true,
      extracted_entities: [],
      extracted_commitments: [],
      extracted_dates: null,
    })
    .eq('user_id', userId)
    .eq('processed', false)
    .in('id', staleDeferredSignalIds);

  if (quarantineResult.error) {
    throw new Error(`signal_quarantine: ${quarantineResult.error.message}`);
  }

  logStructuredEvent({
    event: 'signal_processor_stale_signal_quarantined',
    level: 'warn',
    userId,
    artifactType: null,
    generationStatus: 'signal_quarantined',
    details: {
      scope: 'signal-processor',
      quarantined_signals: staleDeferredSignalIds.length,
    },
  });

  return staleDeferredSignalIds;
}

export async function countUnprocessedSignals(
  userId: string,
  options: SignalQueryOptions = {},
): Promise<number> {
  const supabase = createServerClient();
  let countQuery = supabase
    .from('tkg_signals')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('processed', false)
    .in('source', EXTRACTABLE_SOURCES);

  if (options.createdAtGte) {
    countQuery = countQuery.gte('created_at', options.createdAtGte);
  }

  const countResult = await countQuery;

  if (countResult.error) {
    throw new Error(`signal_count: ${countResult.error.message}`);
  }

  return countResult.count ?? 0;
}

export async function listUsersWithUnprocessedSignals(
  options: SignalQueryOptions = {},
): Promise<string[]> {
  const supabase = createServerClient();
  let signalsQuery = supabase
    .from('tkg_signals')
    .select('user_id')
    .eq('processed', false)
    .in('source', EXTRACTABLE_SOURCES);

  if (options.createdAtGte) {
    signalsQuery = signalsQuery.gte('created_at', options.createdAtGte);
  }

  const signalsResult = await signalsQuery;

  if (signalsResult.error) {
    throw new Error(`signal_user_list: ${signalsResult.error.message}`);
  }

  const userIds = (signalsResult.data ?? [])
    .map((signal) => signal.user_id)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  return [...new Set(userIds)];
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
