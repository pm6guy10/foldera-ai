/**
 * Signal Processor
 *
 * Runs before directive generation in daily-generate. Takes unprocessed
 * tkg_signals (from Microsoft/Google sync), batches them in groups of 10,
 * and calls Claude Haiku to extract:
 *   - Person names → upsert tkg_entities
 *   - Commitments  → insert tkg_commitments
 *   - Key topics   → merge into tkg_entities.patterns (self entity)
 *
 * After extraction, marks each signal processed=true with extracted_entity_ids
 * and extracted_commitment_ids populated.
 *
 * Fetches up to 100 signals per batch and loops until all unprocessed
 * signals are consumed.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServerClient } from '@/lib/db/client';
import { decrypt } from '@/lib/encryption';
import { trackApiCall } from '@/lib/utils/api-tracker';
import { isOverDailyLimit } from '@/lib/utils/api-tracker';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const BATCH_SIZE = 10;
const FETCH_LIMIT = 100;

// Sources that write raw signals without entity extraction
const EXTRACTABLE_SOURCES = [
  'outlook', 'gmail', 'outlook_calendar', 'google_calendar',
  'onedrive', 'microsoft_todo', 'notion', 'drive', 'dropbox', 'slack',
];

interface RawSignal {
  id: string;
  user_id: string;
  source: string;
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
  errors: string[];
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
export async function processUnextractedSignals(userId: string): Promise<ProcessResult> {
  const result: ProcessResult = {
    signals_processed: 0,
    entities_upserted: 0,
    commitments_created: 0,
    topics_merged: 0,
    errors: [],
  };

  // Check daily spend cap before any API calls
  if (await isOverDailyLimit()) {
    console.log('[signal-processor] Daily spend cap reached, skipping');
    return result;
  }

  const supabase = createServerClient();

  // Get or create self entity for pattern merging
  let { data: selfEntity } = await supabase
    .from('tkg_entities')
    .select('id, patterns')
    .eq('user_id', userId)
    .eq('name', 'self')
    .maybeSingle();

  if (!selfEntity) {
    const { data: created } = await supabase
      .from('tkg_entities')
      .insert({ user_id: userId, type: 'person', name: 'self', display_name: 'You', emails: [], patterns: {} })
      .select('id, patterns')
      .single();
    selfEntity = created;
  }

  const selfId = selfEntity?.id;
  const anthropic = getAnthropicClient();
  let batchCount = 0;

  // Loop in sequential batches of FETCH_LIMIT until all unprocessed signals are consumed
  while (true) {
    // Re-check spend cap before each fetch batch
    if (batchCount > 0 && await isOverDailyLimit()) {
      console.log('[signal-processor] Daily spend cap reached mid-run, stopping');
      break;
    }

    const { data: signals, error: fetchErr } = await supabase
      .from('tkg_signals')
      .select('id, user_id, source, type, content, author, occurred_at')
      .eq('user_id', userId)
      .eq('processed', false)
      .in('source', EXTRACTABLE_SOURCES)
      .order('occurred_at', { ascending: true })
      .limit(FETCH_LIMIT);

    if (fetchErr) {
      result.errors.push(`fetch: ${fetchErr.message}`);
      break;
    }

    if (!signals || signals.length === 0) break;

    console.log(`[signal-processor] Batch ${batchCount + 1}: ${signals.length} unprocessed signals for user ${userId}`);
    batchCount++;

    // Process in sub-batches of BATCH_SIZE (for Claude API calls)
    for (let i = 0; i < signals.length; i += BATCH_SIZE) {
      // Re-check spend cap between sub-batches
      if (i > 0 && await isOverDailyLimit()) {
        console.log('[signal-processor] Daily spend cap reached mid-run, stopping');
        break;
      }

      const batch = signals.slice(i, i + BATCH_SIZE);
      try {
        const batchResult = await processBatch(anthropic, supabase, batch, userId, selfId, selfEntity?.patterns);
        result.signals_processed += batchResult.signals_processed;
        result.entities_upserted += batchResult.entities_upserted;
        result.commitments_created += batchResult.commitments_created;
        result.topics_merged += batchResult.topics_merged;

        // Update selfEntity patterns in memory for next batch
        if (batchResult.topics_merged > 0 && selfId) {
          const { data: updated } = await supabase
            .from('tkg_entities')
            .select('patterns')
            .eq('id', selfId)
            .single();
          if (updated) selfEntity = { ...selfEntity!, patterns: updated.patterns };
        }
      } catch (batchErr: unknown) {
        const msg = batchErr instanceof Error ? batchErr.message : String(batchErr);
        console.error(`[signal-processor] batch ${i}-${i + batch.length} failed:`, msg);
        result.errors.push(msg);
        // Mark these signals as processed anyway so we don't retry forever
        await markSignalsProcessed(supabase, batch.map(s => s.id));
        result.signals_processed += batch.length;
      }
    }

    // If we got fewer than FETCH_LIMIT, there are no more to process
    if (signals.length < FETCH_LIMIT) break;
  }

  const totalProcessed = result.signals_processed;
  console.log(`Signal processor: ${totalProcessed} signals processed in ${batchCount} batches`);

  return result;
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
    errors: [],
  };

  // Build prompt with decrypted signal content, skipping signals that are still ciphertext
  const skippedIds: string[] = [];
  const decryptedBatch: RawSignal[] = [];
  const signalTexts: string[] = [];

  for (const s of batch) {
    const content = decrypt(s.content);
    if (looksLikeCiphertext(content)) {
      // decrypt() fell through — ENCRYPTION_KEY missing or wrong. Skip so it can be retried later.
      skippedIds.push(s.id);
      continue;
    }
    decryptedBatch.push(s);
    const trimmed = content.length > 2000 ? content.slice(0, 2000) + '...' : content;
    signalTexts.push(`--- Signal ID: ${s.id} | Source: ${s.source} | Type: ${s.type} ---\n${trimmed}`);
  }

  // If all signals were ciphertext, nothing to extract
  if (decryptedBatch.length === 0) {
    console.warn(`[signal-processor] All ${batch.length} signals still encrypted — skipping batch`);
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
  } catch {
    console.error('[signal-processor] Failed to parse Haiku response:', rawText.slice(0, 200));
    // Mark batch as processed even on parse failure
    await markSignalsProcessed(supabase, batch.map(s => s.id));
    result.signals_processed = batch.length;
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

    if (extraction) {
      // Upsert persons → tkg_entities
      for (const person of extraction.persons ?? []) {
        if (!person.name?.trim()) continue;
        const entityId = await upsertEntity(supabase, userId, person);
        if (entityId) {
          entityIds.push(entityId);
          result.entities_upserted++;
        }
      }

      // Insert commitments → tkg_commitments
      for (const commitment of extraction.commitments ?? []) {
        if (!commitment.description?.trim()) continue;
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

    // Mark signal processed with extracted IDs
    await supabase
      .from('tkg_signals')
      .update({
        processed: true,
        extracted_entity_ids: entityIds.length > 0 ? entityIds : null,
        extracted_commitment_ids: commitmentIds.length > 0 ? commitmentIds : null,
      })
      .eq('id', signal.id);

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
    await supabase
      .from('tkg_entities')
      .update({ patterns: merged, patterns_updated_at: new Date().toISOString() })
      .eq('id', selfId);
    result.topics_merged = allTopics.length;
  }

  return result;
}

async function upsertEntity(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  person: ExtractedPerson,
): Promise<string | null> {
  const name = person.name.trim();
  const nameLower = name.toLowerCase();

  // Check if entity already exists (case-insensitive match on name)
  const { data: existing } = await supabase
    .from('tkg_entities')
    .select('id, emails, total_interactions, last_interaction')
    .eq('user_id', userId)
    .ilike('name', nameLower)
    .maybeSingle();

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

    await supabase.from('tkg_entities').update(updates).eq('id', existing.id);
    return existing.id;
  }

  // Insert new entity
  const { data: created, error } = await supabase
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

  if (error) {
    // Likely unique constraint or race condition — not fatal
    console.warn(`[signal-processor] entity insert failed for "${name}":`, error.message);
    return null;
  }
  return created?.id ?? null;
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
    const { data: promisor } = await supabase
      .from('tkg_entities')
      .select('id')
      .eq('user_id', userId)
      .ilike('name', commitment.who.toLowerCase())
      .maybeSingle();
    if (promisor) promisorId = promisor.id;
  }

  // Try to find the promisee entity; fall back to self
  let promiseeId = selfId ?? null;
  if (commitment.to_whom) {
    const { data: promisee } = await supabase
      .from('tkg_entities')
      .select('id')
      .eq('user_id', userId)
      .ilike('name', commitment.to_whom.toLowerCase())
      .maybeSingle();
    if (promisee) promiseeId = promisee.id;
  }

  // Dedup by canonical form
  const canonical = `SYNC:${commitment.category}:${commitment.description.slice(0, 60).replace(/\s+/g, '_')}`;
  const { data: existing } = await supabase
    .from('tkg_commitments')
    .select('id')
    .eq('user_id', userId)
    .eq('canonical_form', canonical)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
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

  if (error) {
    console.warn(`[signal-processor] commitment insert failed:`, error.message);
    return null;
  }
  return created?.id ?? null;
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

async function markSignalsProcessed(
  supabase: ReturnType<typeof createServerClient>,
  signalIds: string[],
): Promise<void> {
  if (signalIds.length === 0) return;
  await supabase
    .from('tkg_signals')
    .update({ processed: true })
    .in('id', signalIds);
}
