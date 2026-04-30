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
import { OWNER_USER_ID } from '@/lib/auth/constants';
import { createServerClient } from '@/lib/db/client';
import { decryptWithStatus, encrypt } from '@/lib/encryption';
import { recoverMicrosoftSignalContent } from '@/lib/sync/microsoft-sync';
import { isPaidLlmAllowed } from '@/lib/llm/paid-llm-gate';
import { trackApiCall } from '@/lib/utils/api-tracker';
import { isOverDailyLimit } from '@/lib/utils/api-tracker';
import { logStructuredEvent } from '@/lib/utils/structured-logger';
import { truncateSignalContent } from '@/lib/utils/signal-egress';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const BATCH_SIZE = 20;
const DEFAULT_MAX_SIGNALS = 20;
const MAX_WARNING_LOGS = 5;

// Sources that write raw signals without entity extraction
export const EXTRACTABLE_SOURCES = [
  'outlook', 'gmail', 'outlook_calendar', 'google_calendar',
  'onedrive', 'microsoft_todo', 'notion', 'drive', 'dropbox', 'slack',
  'claude_conversation',
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

export type TrustClass = 'trusted' | 'junk' | 'transactional' | 'personal' | 'unclassified';

interface SensitiveDetectionResult {
  isSensitive: boolean;
  types: string[];
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
  dryRun?: boolean;
  /** Skip Haiku extraction LLM (e.g. operator `pipelineDryRun`). */
  skipLlmExtraction?: boolean;
  /**
   * Owner/dev proof only: allows paid extraction calls even when ALLOW_PAID_LLM=false.
   * Must be explicitly opted in by caller and still hard-checks owner user id.
   */
  allowOwnerDevPaidLlmBypass?: boolean;
}

export interface SignalQueryOptions {
  createdAtGte?: string;
  includeAllSources?: boolean;
}

export const LOW_BACKLOG_SIGNAL_BATCH_SIZE = 50;
export const LOW_BACKLOG_MAX_SIGNAL_ROUNDS = 3;
export const HIGH_BACKLOG_SIGNAL_BATCH_SIZE = 100;
export const HIGH_BACKLOG_MAX_SIGNAL_ROUNDS = 10;
export const HIGH_BACKLOG_SIGNAL_THRESHOLD = 100;
export const SENSITIVE_REDACTION_TOKEN = '[REDACTED_SENSITIVE]';

export interface SignalBacklogMode {
  maxSignals: number;
  mode: 'high' | 'low';
  rounds: number;
}

export function resolveSignalBacklogMode(unprocessedCount: number): SignalBacklogMode {
  if (unprocessedCount >= HIGH_BACKLOG_SIGNAL_THRESHOLD) {
    return {
      mode: 'high',
      maxSignals: HIGH_BACKLOG_SIGNAL_BATCH_SIZE,
      rounds: HIGH_BACKLOG_MAX_SIGNAL_ROUNDS,
    };
  }

  return {
    mode: 'low',
    maxSignals: LOW_BACKLOG_SIGNAL_BATCH_SIZE,
    rounds: LOW_BACKLOG_MAX_SIGNAL_ROUNDS,
  };
}

const EXTRACTION_PROMPT = `You are extracting structured data from raw signals (emails, calendar events, files, tasks) for a personal chief of staff system.

For each signal in the batch, extract:

1. **persons** — every person mentioned by name. Include email if visible, role/title if stated, company if stated. For email signals (gmail, outlook, email_sent, email_received), always extract the sender and recipients from the From/To headers when they refer to real people. If a header includes both a name and email, preserve both. Do NOT include the user themselves.
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

/** Remove trailing commas before `}` or `]` (common invalid LLM JSON). */
function stripJsonTrailingCommas(s: string): string {
  return s.replace(/,(\s*[}\]])/g, '$1');
}

/**
 * First top-level `[` … `]` span with string-aware bracket depth (avoids greedy whole-string
 * `[`…`]` regex swallowing prose after a malformed tail).
 */
function extractFirstTopLevelJsonArray(raw: string): string | null {
  const start = raw.indexOf('[');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        continue;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

/** Haiku sometimes wraps the array in an object or returns a single row object. */
function coerceExtractionsArray(parsed: unknown): {
  arr: SignalExtraction[];
  shape?: 'object_wrapper' | 'single_object';
} | null {
  if (Array.isArray(parsed)) {
    return { arr: parsed as SignalExtraction[] };
  }
  if (parsed && typeof parsed === 'object') {
    const o = parsed as Record<string, unknown>;
    for (const key of ['extractions', 'signals', 'results', 'data'] as const) {
      const v = o[key];
      if (Array.isArray(v)) {
        return { arr: v as SignalExtraction[], shape: 'object_wrapper' };
      }
    }
    if (typeof o.signal_id === 'string') {
      return { arr: [parsed as SignalExtraction], shape: 'single_object' };
    }
  }
  return null;
}

export type SignalExtractionJsonRecovery =
  | 'trailing_comma'
  | 'array_extract'
  | 'array_extract_trailing_comma'
  | 'object_wrapper'
  | 'single_object';

/** Exported for unit tests (Haiku batch path uses this parser). */
export function parseSignalExtractionJson(rawText: string): {
  extractions: SignalExtraction[];
  recovery?: SignalExtractionJsonRecovery;
} {
  const cleaned = rawText.replace(/```(?:json|JSON)?\s*\n?/g, '').trim();
  type ParseAttempt = { recovery?: 'trailing_comma' | 'array_extract' | 'array_extract_trailing_comma'; text: string };
  const attempts: ParseAttempt[] = [
    { text: cleaned },
    { recovery: 'trailing_comma', text: stripJsonTrailingCommas(cleaned) },
  ];
  const balanced = extractFirstTopLevelJsonArray(cleaned);
  if (balanced) {
    attempts.push({ recovery: 'array_extract', text: balanced });
    attempts.push({ recovery: 'array_extract_trailing_comma', text: stripJsonTrailingCommas(balanced) });
  }
  const seen = new Set<string>();
  let lastErr = 'empty';
  for (const { text, recovery } of attempts) {
    if (seen.has(text)) continue;
    seen.add(text);
    try {
      const parsed: unknown = JSON.parse(text);
      const coerced = coerceExtractionsArray(parsed);
      if (coerced) {
        const combined: SignalExtractionJsonRecovery | undefined =
          recovery ??
          (coerced.shape === 'object_wrapper'
            ? 'object_wrapper'
            : coerced.shape === 'single_object'
              ? 'single_object'
              : undefined);
        return { extractions: coerced.arr, recovery: combined };
      }
      lastErr = 'parsed_non_array';
    } catch (e: unknown) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(lastErr);
}

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

  if (options.skipLlmExtraction === true) {
    return result;
  }

  // Check daily spend cap before any API calls
  try {
    if (await isOverDailyLimit(userId, 'signal_extraction')) {
      return result;
    }
  } catch (err: unknown) {
    result.errors.push(`spend_cap: ${err instanceof Error ? err.message : String(err)}`);
    return result;
  }

  const ownerDevPaidBypass =
    options.allowOwnerDevPaidLlmBypass === true &&
    userId === OWNER_USER_ID;

  if (!isPaidLlmAllowed() && !ownerDevPaidBypass) {
    result.errors.push('paid_llm_disabled');
    return result;
  }

  const supabase = createServerClient();
  const isDryRun = options.dryRun === true;

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
  if (!selfEntity && !isDryRun) {
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
      const batchResult = await processBatch(
        anthropic,
        supabase,
        signals,
        userId,
        selfId,
        selfEntity?.patterns,
        isDryRun,
      );
      const quarantinedDeferredSignalIds = isDryRun
        ? []
        : await quarantineDeferredSignals(
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

        if (refreshedPatternsResult.data && selfEntity?.id) {
          selfEntity = {
            id: selfEntity.id,
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
 * Returns true if the signal was sent by Foldera itself (noreply@ / brief@ or
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
  /\b(bill\s*payment|payment\s*(?:due|reminder)|auto.?pay|statement\s*(?:ready|available)|account\s*(?:ending|balance)|amount\s*due|update\s*(?:your\s*)?(?:billing|payment)\s*(?:information|method|details))\b/i,
  // System-generated / automated emails
  /\b(no.?reply|noreply|automated|unsubscribe|do.?not.?reply|data\s*export|will\s*be\s*emailed\s*when\s*ready)\b/i,
  // Personal errands
  /\b(pizza|dinner|lunch|breakfast|groceries|laundry|cleaning|oil\s*change|car\s*wash)\b/i,
  // Generic calendar event titles without a person
  /^(meeting|event|reminder|call|check.?in)$/i,
  // Feedback/survey requests from services
  /\b(provide\s*feedback|rate\s*(?:your|our)|how\s*was\s*your|survey|experience\s*(?:for|with))\b/i,
  // Security alerts and account notifications
  /\b(unauthorized\s*(?:login|access|sign.?in)|verify\s*(?:your|new)\s*sign.?in|review\s*account\s*(?:security|activity)|suspicious\s*activity|two.?factor|2fa|security\s*(?:alert|notice|code))\b/i,
  // Newsletter / marketing / spam
  /\b(deals?\s*(?:promotion|valid)|livestream|webinar\s*(?:recording|replay)|limited.?time\s*offer|exclusive\s*(?:offer|deal|discount)|free\s*(?:trial|shipping)|promo(?:tion(?:al)?)?|sale\s*(?:ends?|starts?))\b/i,
  // Generic event promotions and community events (not personal)
  /\b(egg.?stravaganza|fishing\s*deals|career\s*workshop|dozer\s*days)\b/i,
  // Mass registration / program signup (impersonal)
  /\b(complete\s*registration\s*for|register\s*for\s*.{0,30}(?:program|initiative|workshop|training|webinar))\b/i,
  // Credit / account monitoring (routine, not urgent)
  /\b(check\s*(?:your\s*)?credit\s*score|credit\s*(?:monitoring|report|check)|check\s*account\s*(?:activity|balance))\b/i,
  // Tool / service management (not user's real work)
  /\b(review\s*(?:Google|Microsoft|Apple|Robinhood|Stripe)\s*(?:account|security|settings))\b/i,
  /\b(grant(?:ed)?\s*(?:Claude|Foldera|app)\s*(?:access|permission))\b/i,
  // Self-referential: directives extracted as commitments
  /\b(?:Foldera\s*(?:Directive|directive)|(?:schedule|block)\s*(?:a\s*)?(?:30|60|15|45).?minute\s*(?:block|review|session)\s*(?:to\s*(?:review|check|assess|audit)))\b/i,
  // Vercel deployment notifications (infrastructure noise)
  /\b(?:vercel|deployment|deploy(?:ed|ing)?)\s+(?:failed|succeeded|ready|error|build|complete|cancel)/i,
  /\b(?:build\s+(?:failed|succeeded|error|complete)|production\s+deployment)\b/i,
  // Job application procedural steps — HR requests to the candidate, not personal commitments
  // "provide [name]'s contact information as a reference" is someone asking, not the user
  // committing to something
  /\bprovide\s+\w[\w\s''-]{0,40}'?s?\s+(?:contact\s+(?:information|info|details?)|phone|email)\b/i,
  /\b(?:supervisor|professional|personal)\s+reference\s+(?:contact|information|info)\b/i,
  /\bsubmit\s+(?:your\s+)?(?:application|resume|cv|references?)\b/i,
  /\bcomplete\s+(?:your\s+)?(?:background\s+check|onboarding|new\s+hire|paperwork|i-?9|w-?4)\b/i,
  /\bprovide\s+(?:your\s+)?(?:references?|supervisor\s+references?|two\s+references?|three\s+references?)\b/i,
  // Automated financial credit / reward notifications (zero-agency: no action needed)
  /\b(?:credit\s+(?:has\s+been\s+)?applied|cash\s*back\s+(?:credited|earned|applied)|reward\s*(?:credit|points?\s+(?:earned|applied|credited))|bonus\s+(?:miles?|points?|cash)\s+(?:earned|applied|credited)|you(?:['']?ve)?\s+(?:been\s+)?(?:awarded|credited)\s+\$?[\d])/i,
  // Transaction / payment confirmation (informational, no user action needed)
  /\b(?:payment\s+(?:has\s+been\s+)?(?:confirmed|received|processed|successful|posted)|transaction\s+(?:has\s+been\s+)?(?:confirmed|complete|posted|processed)|direct\s+deposit\s+(?:received|posted)|wire\s+(?:transfer\s+)?(?:received|processed|complete)|deposit\s+(?:has\s+been\s+)?(?:posted|confirmed|credited))\b/i,
  // Past-tense paid transaction logs with amounts (already done; zero-agency)
  /\bpaid\s+(?:[A-Za-z][\w'-]{0,24}\s+){0,5}\$?\d[\d,]*(?:\.\d{2})?\b/i,
  // Order / booking / subscription confirmations (zero-agency)
  /\b(?:order\s+(?:has\s+been\s+)?(?:confirmed|placed|shipped|delivered|is\s+on\s+its\s+way)|booking\s+(?:is\s+)?confirmed|reservation\s+(?:is\s+)?confirmed|subscription\s+(?:has\s+been\s+)?(?:renewed|confirmed|activated|reactivated))\b/i,
  // Generic "you will be notified" / passive receipt messages (zero-agency)
  /\b(?:you\s+will\s+(?:be\s+notified|receive\s+an?\s+email)|you(?:['']?ve)?\s+received\s+(?:a|your)\s+(?:confirmation|receipt|statement))\b/i,
];

export function isNonCommitment(description: string): boolean {
  return NON_COMMITMENT_PATTERNS.some((pattern) => pattern.test(description));
}

const SENSITIVE_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: 'ssn', pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
  { type: 'ssn', pattern: /\bsocial\s+security\b/i },
  { type: 'bank_account', pattern: /\b(?:account|acct)\s*(?:number|no\.?)?\s*[:#]?\s*\d{6,17}\b/i },
  { type: 'routing_number', pattern: /\brouting\s*(?:number|no\.?)?\s*[:#]?\s*\d{9}\b/i },
  { type: 'payment_card', pattern: /\b(?:\d[ -]*?){13,19}\b/ },
  { type: 'identity_document', pattern: /\bdriver'?s?\s+license\b/i },
  { type: 'identity_document', pattern: /\bpassport\b/i },
  { type: 'identity_document', pattern: /\bidentity\s+document\b/i },
  { type: 'tax_document', pattern: /\birs\b/i },
  { type: 'tax_document', pattern: /\bw-?2\b/i },
  { type: 'tax_document', pattern: /\b1099\b/i },
  { type: 'tax_document', pattern: /\btax\s+return\b/i },
];

function stripAttachmentContent(rawContent: string): string {
  const lines = rawContent.split('\n');
  const keptLines: string[] = [];
  let skippingAttachmentBlock = false;

  for (const line of lines) {
    const attachmentHeader = /^\s*(?:attachment|attached file|file name)\s*[:\-]/i.test(line);
    const attachmentStart = /^\s*\[(?:attachment|file|pdf|image):/i.test(line);
    const attachmentEnd = /^\s*\[\/(?:attachment|file|pdf|image)\]/i.test(line);

    if (attachmentHeader || attachmentStart) {
      skippingAttachmentBlock = true;
      continue;
    }

    if (attachmentEnd) {
      skippingAttachmentBlock = false;
      continue;
    }

    if (!skippingAttachmentBlock) {
      keptLines.push(line);
    }
  }

  return keptLines.join('\n');
}

export function detectSensitiveContent(content: string): SensitiveDetectionResult {
  const sensitiveTypes = new Set<string>();
  for (const candidate of SENSITIVE_PATTERNS) {
    if (candidate.pattern.test(content)) {
      sensitiveTypes.add(candidate.type);
    }
  }

  return {
    isSensitive: sensitiveTypes.size > 0,
    types: [...sensitiveTypes],
  };
}

// ---------------------------------------------------------------------------
// Signal-level junk classifier — applied to email/Outlook signals BEFORE
// commitment extraction. Signals matching these patterns are still processed
// for entities and topics, but produce ZERO commitments.
// ---------------------------------------------------------------------------

const JUNK_EMAIL_SUBJECT_PATTERNS = [
  // Promotional / marketing
  /\b(?:sale|deal|discount|offer|promo|promotion|coupon|savings?|clearance|limited.?time|special\s+price|% off|off today|shop now|buy now|order now|flash\s+sale|exclusive\s+(?:access|offer|deal|discount))\b/i,
  // Newsletters and digests
  /\b(?:newsletter|weekly\s+digest|monthly\s+update|roundup|recap|highlights?|top\s+stories?|daily\s+brief|weekly\s+wrap)\b/i,
  // Marketing drip / product announcement
  /\b(?:introducing|announcing|new\s+feature|product\s+update|release\s+notes?|changelog|what['']?s\s+new)\b/i,
  // Account statements and snapshots (not urgent)
  /\b(?:account\s+statement|monthly\s+statement|transaction\s+(?:history|summary)|balance\s+summary|statement\s+(?:is\s+)?(?:ready|available)|year.?end\s+summary)\b/i,
  // Webinar / event spam
  /\b(?:webinar|virtual\s+event|online\s+summit|register\s+now|save\s+your\s+seat|join\s+us\s+(?:for|on)|recording\s+available|watch\s+(?:the\s+)?replay)\b/i,
  // Rewards / loyalty noise
  /\b(?:reward(?:s)?\s+(?:points?|update|summary|earned)|points?\s+(?:earned|available|expire)|loyalty\s+program|member\s+exclusive)\b/i,
  // Billing noise (account snapshots, not real overdue notices)
  /\b(?:your\s+(?:bill|invoice|receipt|payment)\s+is\s+(?:ready|available|processed)|payment\s+(?:received|processed|confirmed))\b/i,
  // SaaS renewal / subscription noise
  /\b(?:subscription\s+(?:renewed|confirmed|active|expires?)|renewal\s+(?:notice|confirmation|reminder)|plan\s+(?:renewed|updated|downgraded|upgraded))\b/i,
  // Food delivery / rideshare receipts
  /\b(?:your\s+(?:order|delivery|ride)\s+(?:is\s+)?(?:on\s+(?:the\s+)?way|confirmed|delivered|complete)|delivery\s+confirmation|ride\s+(?:receipt|summary))\b/i,
  // Social media notifications
  /\b(?:new\s+(?:follower|like|comment|mention|connection|endorsement)|someone\s+(?:liked|commented|mentioned|followed|endorsed)|tagged\s+you|shared\s+(?:a\s+)?post)\b/i,
  // App store / purchase receipts
  /\b(?:purchase\s+(?:receipt|confirmation)|app\s+(?:receipt|purchase)|in.?app\s+purchase|download\s+(?:receipt|confirmation))\b/i,
  // Automated survey / feedback requests
  /\b(?:how\s+(?:was|did)\s+(?:your|the)|rate\s+(?:your|our)|take\s+(?:a\s+)?(?:quick\s+)?survey|feedback\s+(?:request|survey)|tell\s+us\s+(?:how|what))\b/i,
];

const JUNK_EMAIL_SENDER_PATTERNS = [
  /\b(?:noreply|no-reply|donotreply|do-not-reply|notifications?|alerts?|mailer|newsletter|campaigns?|marketing|promotions?|deals?|offers?)\b/i,
  // Known bulk/transactional sender domains
  /\b(?:mailchimp|sendgrid|constantcontact|klaviyo|marketo|hubspot|salesforce\s*email|brevo|campaign\s*monitor)\b/i,
  // Social media notification senders
  /\b(?:facebookmail|linkedin|twitter|x\.com|instagram|tiktok|pinterest|reddit|quora|medium)\b/i,
  // Food delivery / rideshare / e-commerce
  /\b(?:doordash|ubereats|grubhub|postmates|instacart|uber|lyft|amazon|ebay|etsy|shopify)\b/i,
];

const JUNK_EMAIL_BODY_PATTERNS = [
  // Unsubscribe indicator (definitive bulk email marker)
  /\b(?:unsubscribe|manage\s+(?:your\s+)?(?:email\s+)?preferences?|opt\s*out|email\s+preferences?|update\s+preferences?)\b/i,
  // Promotional body language
  /\b(?:limited.?time|ends?\s+(?:soon|tonight|sunday|monday)|today\s+only|don['']?t\s+miss|hurry|act\s+now|claim\s+(?:your|this)|exclusive\s+for\s+(?:you|members?))\b/i,
  // Account / system snapshot noise
  /\b(?:this\s+is\s+an?\s+automated\s+(?:email|message|notification)|you['']?re\s+receiving\s+this\s+(?:email|message)\s+because)\b/i,
  // Security-only alerts (no user action required on our side)
  /\b(?:sign.?in\s+from\s+(?:a\s+)?new\s+device|new\s+sign.?in\s+(?:detected|from)|someone\s+signed\s+in|login\s+attempt|access\s+attempt)\b/i,
  // Bulk email footer markers
  /\b(?:view\s+(?:in|this\s+email\s+in)\s+(?:your\s+)?browser|add\s+us\s+to\s+your\s+(?:address\s+book|contacts)|(?:to\s+)?stop\s+receiving\s+these\s+emails)\b/i,
  // Tracking pixel / marketing infrastructure
  /\b(?:click\s+here\s+to\s+(?:view|open)|having\s+trouble\s+(?:viewing|reading)\s+this\s+email|if\s+(?:this\s+email|images?)\s+(?:doesn['']?t|don['']?t|do\s+not)\s+(?:display|show|load))\b/i,
];

/**
 * Returns true if an email/Outlook signal is junk (promo, newsletter, account
 * snapshot, spam, or system noise). Junk signals still produce entities and
 * topics, but NEVER produce commitments.
 *
 * Only call this for email-class sources (outlook, gmail).
 */
export function isJunkEmailSignal(source: string, content: string): boolean {
  const emailSources = new Set(['outlook', 'gmail', 'outlook_calendar', 'google_calendar']);
  if (!emailSources.has(source)) return false;

  // Extract subject line if present
  const subjectMatch = content.match(/^Subject:\s*(.+)$/im);
  const subject = subjectMatch?.[1]?.trim() ?? '';

  // Extract From line for sender check
  const fromMatch = content.match(/^From:\s*(.+)$/im);
  const from = fromMatch?.[1]?.trim() ?? '';

  if (subject && JUNK_EMAIL_SUBJECT_PATTERNS.some(p => p.test(subject))) return true;
  if (from && JUNK_EMAIL_SENDER_PATTERNS.some(p => p.test(from))) return true;

  // Body check (first 3000 chars to cap cost)
  const body = content.slice(0, 3000);
  if (JUNK_EMAIL_BODY_PATTERNS.some(p => p.test(body))) return true;

  return false;
}

const TRANSACTIONAL_SIGNAL_PATTERNS = [
  /\b(?:order\s*(?:confirmation|number|#)|receipt|invoice|shipment|shipped|delivery|tracking|return(?:ed|s)?|refund)\b/i,
  /\b(?:password\s*reset|security\s*alert|verification\s*code|two[- ]?factor|2fa|sign.?in\s*alert|new\s*device)\b/i,
  /\b(?:billing\s*statement|payment\s*(?:received|processed|confirmed)|direct\s*deposit)\b/i,
];

const PERSONAL_SIGNAL_PATTERNS = [
  /\b(?:wife|husband|son|daughter|mom|mother|dad|father|sister|brother|family|friend)\b/i,
];

function containsBulkSenderPattern(author: string): boolean {
  const lower = author.toLowerCase();
  if (!lower) return false;
  if (/\b(?:noreply|no-reply|newsletter|marketing)\b/i.test(lower)) return true;
  if (/@[a-z0-9.-]*amazonses\.com\b/i.test(lower)) return true;
  return JUNK_EMAIL_SENDER_PATTERNS.some((pattern) => pattern.test(author));
}

export function classifySignalTrustClass(
  source: string,
  signalType: string,
  author: string | null | undefined,
  content: string,
): TrustClass {
  const safeAuthor = author ?? '';
  const safeContent = content ?? '';

  if (containsBulkSenderPattern(safeAuthor) || isJunkEmailSignal(source, safeContent)) {
    return 'junk';
  }

  if (TRANSACTIONAL_SIGNAL_PATTERNS.some((pattern) => pattern.test(safeContent))) {
    return 'transactional';
  }

  if (signalType === 'email_received' && PERSONAL_SIGNAL_PATTERNS.some((pattern) => pattern.test(`${safeAuthor}\n${safeContent}`))) {
    return 'personal';
  }

  return 'trusted';
}

/**
 * Classify entity trust based on the entity's own email address and interaction count.
 * This runs AFTER the signal-level classifySignalTrustClass and provides entity-level overrides.
 *
 * Precedence (high → low): transactional pattern > gov/org domain > interaction-based > junk
 */
export function classifyEntityTrustClass(
  email: string | null | undefined,
  totalInteractions: number,
): TrustClass {
  const e = (email ?? '').toLowerCase();
  const domain = e.includes('@') ? e.split('@')[1] ?? '' : e;

  // Transactional/bulk senders — email address itself is a noreply pattern
  if (/noreply|no-reply|donotreply|newsletter|marketing/.test(e)) {
    return 'transactional';
  }

  // Government or nonprofit domains = trusted regardless of interaction count
  if (domain.endsWith('.gov') || domain.endsWith('.org')) {
    return 'trusted';
  }

  // Has email address + at least 1 real interaction = trusted contact
  if (email && totalInteractions >= 1) return 'trusted';

  // No email but multiple interactions = verified known contact
  if (!email && totalInteractions >= 2) return 'trusted';

  // Zero interactions = not yet meaningful, classify as junk so noise doesn't pollute scoring
  if (totalInteractions === 0) return 'junk';

  return 'unclassified';
}

function mergeTrustClass(existing: TrustClass | null | undefined, incoming: TrustClass): TrustClass {
  const current: TrustClass = existing ?? 'unclassified';
  if (current === incoming) return current;
  if (current === 'trusted' || incoming === 'trusted') return 'trusted';
  if (current === 'unclassified') return incoming;
  if (incoming === 'unclassified') return current;
  return 'unclassified';
}

// ---------------------------------------------------------------------------
// Commitment eligibility gate — hard requirements before any commitment is
// inserted into tkg_commitments, regardless of source or signal type.
// ---------------------------------------------------------------------------

/**
 * Returns true if the extracted commitment meets the minimum bar to be
 * stored as a real commitment. Requires:
 *   - A real actor (non-empty "who" that is not a generic placeholder)
 *   - A real obligation (description long enough to be meaningful)
 *   - A named relationship (who or to_whom must be a real person token)
 *   - Not matching any NON_COMMITMENT_PATTERNS (already checked by caller)
 */
export function isEligibleCommitment(commitment: { description: string; who?: string; to_whom?: string | null; category?: string }): boolean {
  const desc = (commitment.description ?? '').trim();
  // Too short to be meaningful
  if (desc.length < 12) return false;

  const who = (commitment.who ?? '').trim();
  const toWhom = (commitment.to_whom ?? '').trim();

  // Must have at least one named party that looks like a real person or org
  // (not a generic pronoun or empty string)
  const GENERIC_ACTORS = new Set(['i', 'me', 'you', 'we', 'they', 'it', 'user', 'unknown', 'n/a', '']);
  const whoIsReal = who.length >= 2 && !GENERIC_ACTORS.has(who.toLowerCase());
  const toWhomIsReal = toWhom.length >= 2 && !GENERIC_ACTORS.has(toWhom.toLowerCase());

  if (!whoIsReal && !toWhomIsReal) return false;

  // Description must look like an obligation — needs an action verb token
  // (we check for common action-verb starters; if none found, require category != 'other')
  const ACTION_VERB_RE = /\b(?:send|submit|review|schedule|call|email|write|deliver|complete|finish|prepare|provide|follow\s*up|respond|reply|draft|sign|pay|confirm|book|present|share|update|approve|decide|fix|resolve|close|meet|discuss|negotiate|file|upload|download|deploy|integrate|implement|configure|notify)\b/i;
  if (!ACTION_VERB_RE.test(desc) && (commitment.category ?? 'other') === 'other') return false;

  return true;
}

export function isUserTheActor(
  commitment: {
    description: string;
    category?: string;
    canonical_form?: string;
  },
  signalContent = '',
): boolean {
  const description = (commitment.description ?? '').trim();
  if (description.length === 0) return false;
  const lower = description.toLowerCase();

  const canonical = typeof commitment.canonical_form === 'string' && commitment.canonical_form.trim().length > 0
    ? commitment.canonical_form
    : `SYNC:${(commitment.category ?? 'other').trim()}:`;
  const canonicalLower = canonical.toLowerCase();

  const notificationRecipientPatterns = [
    /\bwill be (?:charged|collected|automatically|posted)\b/i,
    /\bhas been (?:processed|received|applied)\b/i,
    /\bif (?:you are )?interested\b/i,
    /\b(?:to receive|you will receive|you have been selected)\b/i,
    /\b(?:explore exclusive|claim your|redeem your|unlock your)\b/i,
    /\bpayment (?:received|processed|posted)\b/i,
    /\bsend .* to (?:user|you)\b/i,
  ];
  if (notificationRecipientPatterns.some((pattern) => pattern.test(lower))) return false;

  if (/\bregister for .*(?:webinars?|event|conference|session)\b/i.test(lower)) return false;
  if (/\bparticipate in .*(?:research|study|survey|role)\b/i.test(lower)) return false;

  const isPaymentFinancial = canonicalLower.startsWith('sync:payment_financial:');
  if (
    isPaymentFinancial &&
    /\b(?:payment (?:received|processed|posted)|will be (?:charged|collected|posted)|has been (?:processed|received|applied))\b/i.test(lower)
  ) {
    return false;
  }

  const isAttendParticipate = canonicalLower.startsWith('sync:attend_participate:');
  if (
    isAttendParticipate &&
    /\b(?:webinar|exclusive|reveal|insights|opportunity)\b/i.test(lower) &&
    !/\b(?:rsvp(?:'d)?|signed up|registered|accepted invite)\b/i.test(lower)
  ) {
    return false;
  }

  const isProvideInformation = canonicalLower.startsWith('sync:provide_information:');
  if (
    isProvideInformation &&
    /\b(?:record (?:your )?screen|share (?:the )?loom|clear (?:your )?cache|try (?:a )?different browser|refresh (?:the )?page)\b/i.test(lower)
  ) {
    return false;
  }

  const signalLower = signalContent.toLowerCase();
  const looksInboundEmail = /(^|\n)\s*from:\s+/i.test(signalLower) &&
    /(^|\n)\s*to:\s+/i.test(signalLower) &&
    !/\[sent email:/i.test(signalLower);
  if (looksInboundEmail && /\bparticipate in .*(?:research|study|survey|role)\b/i.test(lower)) {
    return false;
  }

  return true;
}

async function processBatch(
  anthropic: Anthropic,
  supabase: ReturnType<typeof createServerClient>,
  batch: RawSignal[],
  userId: string,
  selfId: string | undefined,
  selfPatterns: Record<string, any> | undefined,
  dryRun = false,
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
  const sensitiveSignalMap = new Map<string, string[]>();
  const trustClassBySignalId = new Map<string, TrustClass>();
  const signalTexts: string[] = [];
  // Track which signal IDs are junk emails — built during decrypt pass so we
  // don't need to re-decrypt in the extraction pass.
  const junkSignalIds = new Set<string>();
  let decryptWarningCount = 0;

  for (const s of batch) {
    const decrypted = decryptWithStatus(s.content);
    let content = decrypted.plaintext;

    if (decrypted.usedFallback && isMicrosoftRecoverableSignal(s)) {
      try {
        if (dryRun) {
          throw new Error('microsoft_recovery_skipped_in_dry_run');
        }
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
      // Immediately quarantine undecryptable signals so they never block the pipeline.
      // Previously these stayed unprocessed, accumulated as stale, triggered the stale
      // guard, and blocked generation permanently.
      if (!dryRun) {
        const quarantineErr = await supabase
          .from('tkg_signals')
          .update({
            processed: true,
            extracted_entities: [],
            extracted_commitments: [],
            extracted_dates: null,
            extraction_parse_error: null,
          })
          .eq('id', s.id)
          .then((r) => r.error);
        if (quarantineErr) {
          result.errors.push(`quarantine_decrypt_failed: ${quarantineErr.message}`);
        }
      }
      result.signals_processed += 1;
      logStructuredEvent({
        event: 'signal_decrypt_failed_quarantined',
        level: 'warn',
        userId,
        artifactType: null,
        generationStatus: 'decrypt_quarantined',
        details: {
          scope: 'signal-processor',
          signalId: s.id,
          signal_source: s.source,
        },
      });
      continue;
    }

    const contentSansAttachments = stripAttachmentContent(content);
    const sensitive = detectSensitiveContent(contentSansAttachments);
    if (sensitive.isSensitive) {
      sensitiveSignalMap.set(s.id, sensitive.types);
      if (!dryRun) {
        const redactionMetadata = [{
          sensitive_flag: true,
          sensitive_types: sensitive.types,
        }];
        const redactResult = await supabase
          .from('tkg_signals')
          .update({
            content: encrypt(SENSITIVE_REDACTION_TOKEN),
            processed: true,
            extracted_entities: [],
            extracted_commitments: [],
            extracted_dates: redactionMetadata,
            extraction_parse_error: null,
          })
          .eq('id', s.id);
        if (redactResult.error) {
          result.errors.push(`sensitive_redact: ${redactResult.error.message}`);
        }
      }

      result.signals_processed += 1;
      logStructuredEvent({
        event: 'signal_sensitive_redacted',
        level: 'warn',
        userId,
        artifactType: null,
        generationStatus: 'sensitive_redacted',
        details: {
          scope: 'signal-processor',
          signalId: s.id,
          sensitive_types: sensitive.types,
        },
      });
      continue;
    }

    // Signal-level junk check during decrypt pass — skip LLM extraction entirely
    // for junk signals. Saves API credits and prevents noise entities/topics/commitments.
    if (isJunkEmailSignal(s.source, contentSansAttachments)) {
      junkSignalIds.add(s.id);
      if (!dryRun) {
        await supabase
          .from('tkg_signals')
          .update({
            processed: true,
            extracted_entities: [],
            extracted_commitments: [],
            extracted_dates: null,
            extraction_parse_error: null,
          })
          .eq('id', s.id);
      }
      result.signals_processed += 1;
      continue;
    }

    trustClassBySignalId.set(
      s.id,
      classifySignalTrustClass(s.source, s.type, s.author, contentSansAttachments),
    );

    decryptedBatch.push(s);
    const trimmed = contentSansAttachments.length > 2000 ? contentSansAttachments.slice(0, 2000) + '...' : contentSansAttachments;
    signalTexts.push(`--- Signal ID: ${s.id} | Source: ${s.source} | Type: ${s.type} ---\n${trimmed}`);
  }

  // If all signals were ciphertext, nothing to extract
  if (decryptedBatch.length === 0) {
    if (sensitiveSignalMap.size === 0) {
      result.errors.push('decrypt: no decryptable signals in batch');
    }
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
    persist: !dryRun,
  });

  const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
  let extractions: SignalExtraction[] = [];
  try {
    const parsed = parseSignalExtractionJson(rawText);
    extractions = parsed.extractions;
    if (!Array.isArray(extractions)) extractions = [];
    if (parsed.recovery) {
      console.info(`[signal-processor] extraction JSON recovered via ${parsed.recovery}`);
    }
  } catch (error: unknown) {
    // Unrecoverable parse after all parser repairs — mark batch processed so the
    // backlog cannot stall indefinitely (api_usage still shows the Haiku call).
    // extraction_parse_error documents the failure for operators.
    const errMsg = error instanceof Error ? error.message : String(error);
    result.errors.push(`parse: ${errMsg}`);
    console.error(
      `[signal-processor] LLM parse failure — quarantining ${decryptedBatch.length} signal(s) with processed=true: ${errMsg}`,
    );
    const reason = errMsg.slice(0, 2000);
    if (!dryRun) {
      for (const signal of decryptedBatch) {
        const { error: upErr } = await supabase
          .from('tkg_signals')
          .update({
            processed: true,
            extracted_entities: [],
            extracted_commitments: [],
            extracted_dates: null,
            extraction_parse_error: reason,
          })
          .eq('id', signal.id);
        if (upErr) {
          result.errors.push(`parse_quarantine:${signal.id}:${upErr.message}`);
        }
      }
    }
    result.signals_processed += decryptedBatch.length;
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
    try {
      await processSingleExtractedSignal({
        signal,
        extractionMap,
        userId,
        selfId,
        dryRun,
        supabase,
        junkSignalIds,
        trustClassBySignalId,
        result,
        allTopics,
      });
    } catch (signalErr: unknown) {
      const message = signalErr instanceof Error ? signalErr.message : String(signalErr);
      result.errors.push(`signal ${signal.id}: ${message}`);
      logStructuredEvent({
        event: 'signal_processor_single_signal_failed',
        level: 'warn',
        userId,
        artifactType: null,
        generationStatus: 'single_signal_failed',
        details: {
          scope: 'signal-processor',
          signalId: signal.id,
          occurred_at: signal.occurred_at,
          error: message.slice(0, 500),
        },
      });
      // Leave signal unprocessed so a data fix or code fix can retry; rest of batch continues.
      continue;
    }
  }

  // Merge topics into self entity patterns
  if (allTopics.length > 0 && selfId && !dryRun) {
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

type TrustClassMap = Map<string, TrustClass>;

async function processSingleExtractedSignal(args: {
  signal: RawSignal;
  extractionMap: Map<string, SignalExtraction>;
  userId: string;
  selfId: string | undefined;
  dryRun: boolean;
  supabase: ReturnType<typeof createServerClient>;
  junkSignalIds: Set<string>;
  trustClassBySignalId: TrustClassMap;
  result: ProcessResult;
  allTopics: ExtractedTopic[];
}): Promise<void> {
  const {
    signal,
    extractionMap,
    userId,
    selfId,
    dryRun,
    supabase,
    junkSignalIds,
    trustClassBySignalId,
    result,
    allTopics,
  } = args;

  const extraction = extractionMap.get(signal.id);
  const entityIds: string[] = [];
  const commitmentIds: string[] = [];

    // Skip commitment and entity extraction for Foldera's own sent emails.
    // These signals are kept for engagement tracking but must not produce
    // commitments or entities — otherwise directives become commitments
    // that generate future directives about themselves (self-referential loop).
    const isFolderaEmail = isFolderaSender(signal.author, signal.content);

    // Signal-level junk gate: junkSignalIds is built during the decrypt pass above.
    const signalIsJunk = junkSignalIds.has(signal.id);
    const signalTrustClass = trustClassBySignalId.get(signal.id) ?? 'unclassified';

    if (extraction && !isFolderaEmail) {
      for (const person of extraction.persons ?? []) {
        if (!person.name?.trim()) continue;
        const entityId = dryRun
          ? `dry-run-entity-${entityIds.length + 1}`
          : await upsertEntity(supabase, userId, person, signal.occurred_at, signalTrustClass, signal.source as string | undefined);
        if (entityId) {
          entityIds.push(entityId);
          result.entities_upserted++;
        }
      }

      // Insert commitments → tkg_commitments (with quality filter).
      // Junk signals are already filtered out before the LLM call,
      // but signalIsJunk is kept as a safety net.
      if (!signalIsJunk) {
        for (const commitment of extraction.commitments ?? []) {
          if (!commitment.description?.trim()) continue;
          if (isNonCommitment(commitment.description)) continue;
          if (!isEligibleCommitment(commitment)) continue;
          if (!isUserTheActor(commitment, signal.content)) {
            console.log(`[signal-processor] Commitment skipped (user is recipient, not actor): ${commitment.description.substring(0, 80)}`);
            continue;
          }
          const commitmentId = dryRun
            ? `dry-run-commitment-${commitmentIds.length + 1}`
            : await insertCommitment(
              supabase, userId, selfId, commitment, signal.id, entityIds, signalTrustClass,
            );
          if (commitmentId) {
            commitmentIds.push(commitmentId);
            result.commitments_created++;
          }
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
      ? (extraction.commitments ?? []).flatMap((c) => {
          if (!c.due?.trim()) return [];
          const dueIso = normalizeInteractionTimestamp(c.due as unknown);
          if (!dueIso) return [];
          return [{ description: c.description, due: dueIso }];
        })
      : [];

    // Mark signal processed with extracted data persisted to columns
    if (!dryRun) {
      const updateSignalResult = await supabase
        .from('tkg_signals')
        .update({
          processed: true,
          extracted_entities: entityIds.length > 0 ? entityIds : [],
          extracted_commitments: commitmentIds.length > 0 ? commitmentIds : [],
          extracted_dates: extractedDates.length > 0 ? extractedDates : null,
          extraction_parse_error: null,
        })
        .eq('id', signal.id);

      if (updateSignalResult.error) {
        throw new Error(`signal_update: ${updateSignalResult.error.message}`);
      }
    }

  result.signals_processed++;
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
        .update({ content: encrypt(truncateSignalContent(recoveredContent)) })
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

// Signal sources that represent real human interactions (emails you sent/received,
// calendar events you attended). These increment total_interactions and update
// last_interaction on an entity.
//
// Passive sources (conversation_ingest, notion, task, etc.) still create the
// entity record so it can be referenced by commitments and goal-matching, but
// they do NOT count as interactions — otherwise a person mentioned 50 times in
// ingested Claude chat transcripts looks identical to someone you emailed 50 times.
const REAL_INTERACTION_SOURCES = new Set([
  'gmail', 'google_calendar',          // Google sync
  'outlook', 'outlook_calendar',       // Microsoft sync
  'email', 'calendar',                 // generic aliases used in tests / ingest
]);

async function upsertEntity(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  person: ExtractedPerson,
  signalOccurredAt: string | null,
  signalTrustClass: TrustClass,
  signalSource?: string,
): Promise<string | null> {
  const name = person.name.trim();
  const nameLower = name.toLowerCase();
  const signalInteractionAt = normalizeInteractionTimestamp(signalOccurredAt as unknown);
  const isRealInteraction = REAL_INTERACTION_SOURCES.has(signalSource ?? '');

  const existingMatches = await findExistingEntityMatches(supabase, userId, person, nameLower);
  const existing = existingMatches[0] ?? null;

  if (existing) {
    for (const match of existingMatches) {
      const updates: Record<string, any> = {};
      if (match.id === existing.id) {
        // Only real interactions count toward total_interactions and last_interaction.
        // Passive mentions (conversation_ingest, notion, task) create/find the entity
        // but do not increment the interaction counter.
        if (isRealInteraction) {
          updates.total_interactions = (match.total_interactions ?? 0) + 1;
        }
        if (person.email && !(match.emails ?? []).includes(person.email)) {
          updates.emails = [...(match.emails ?? []), person.email];
          updates.primary_email = match.primary_email ?? match.emails?.[0] ?? person.email;
        }
        if (person.role) updates.role = person.role;
        if (person.company) updates.company = person.company;

        // Merge signal-level trust class with entity-level classification (email domain + interactions).
        const newInteractions = typeof updates.total_interactions === 'number'
          ? updates.total_interactions
          : (match.total_interactions ?? 0);
        const resolvedEmail = updates.emails?.[0] ?? match.primary_email ?? person.email ?? null;
        const entityTrustClass = classifyEntityTrustClass(resolvedEmail, newInteractions);
        const signalMerged = mergeTrustClass((match.trust_class as TrustClass | null | undefined), signalTrustClass);
        updates.trust_class = mergeTrustClass(signalMerged, entityTrustClass);
      }

      const existingLastInteraction = normalizeInteractionTimestamp(match.last_interaction);
      if (isRealInteraction && (!existingLastInteraction || (signalInteractionAt && signalInteractionAt > existingLastInteraction))) {
        updates.last_interaction = signalInteractionAt ?? new Date().toISOString();
      }

      if (Object.keys(updates).length === 0) {
        continue;
      }

      const updateEntityResult = await supabase.from('tkg_entities').update(updates).eq('id', match.id);
      if (updateEntityResult.error) {
        throw new Error(`entity_update: ${updateEntityResult.error.message}`);
      }
    }
    return existing.id;
  }

  // Insert new entity — passive sources start at 0 interactions with no last_interaction
  // so they don't pollute relationship scoring with mention-only counts.
  const newInteractionsOnInsert = isRealInteraction ? 1 : 0;
  const entityTrustClassOnInsert = classifyEntityTrustClass(person.email, newInteractionsOnInsert);
  const finalTrustClassOnInsert = mergeTrustClass(signalTrustClass, entityTrustClassOnInsert);

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
      trust_class: finalTrustClassOnInsert,
      total_interactions: newInteractionsOnInsert,
      last_interaction: isRealInteraction ? (signalInteractionAt ?? new Date().toISOString()) : null,
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

async function findExistingEntityMatches(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  person: ExtractedPerson,
  normalizedName: string,
): Promise<Array<{
  id: string;
  name?: string | null;
  emails: string[] | null;
  primary_email?: string | null;
  total_interactions: number | null;
  last_interaction: string | null;
  role?: string | null;
  company?: string | null;
  trust_class?: string | null;
}>> {
  const matches = new Map<string, {
    id: string;
    name?: string | null;
    emails: string[] | null;
    primary_email?: string | null;
    total_interactions: number | null;
    last_interaction: string | null;
    role?: string | null;
    company?: string | null;
  }>();

  if (person.email) {
    const emailMatchesResult = await supabase
      .from('tkg_entities')
      .select('id, name, emails, primary_email, total_interactions, last_interaction, role, company, trust_class')
      .eq('user_id', userId)
      .contains('emails', [person.email]);

    if (emailMatchesResult.error) {
      throw new Error(`entity_lookup_email: ${emailMatchesResult.error.message}`);
    }

    for (const match of emailMatchesResult.data ?? []) {
      matches.set(match.id, match);
    }
  }

  const nameMatchResult = await supabase
    .from('tkg_entities')
    .select('id, name, emails, primary_email, total_interactions, last_interaction, role, company, trust_class')
    .eq('user_id', userId)
    .ilike('name', normalizedName)
    .maybeSingle();

  if (nameMatchResult.error) {
    throw new Error(`entity_lookup_name: ${nameMatchResult.error.message}`);
  }

  if (nameMatchResult.data) {
    matches.set(nameMatchResult.data.id, nameMatchResult.data);
  }

  return [...matches.values()].sort(
    (left, right) => rankExistingEntityMatch(right, person, normalizedName) - rankExistingEntityMatch(left, person, normalizedName),
  );
}

function rankExistingEntityMatch(
  entity: {
    name?: string | null;
    primary_email?: string | null;
    emails: string[] | null;
    total_interactions: number | null;
  },
  person: ExtractedPerson,
  normalizedName: string,
): number {
  let score = entity.total_interactions ?? 0;
  if ((entity.name ?? '').toLowerCase() === normalizedName) score += 1000;
  if (person.email && entity.primary_email === person.email) score += 100;
  if (person.email && (entity.emails ?? []).includes(person.email)) score += 50;
  return score;
}

async function insertCommitment(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  selfId: string | undefined,
  commitment: ExtractedCommitment,
  signalId: string,
  entityIds: string[],
  signalTrustClass: TrustClass,
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
      due_at: normalizeInteractionTimestamp(commitment.due),
      source: 'signal_extraction',
      source_id: signalId,
      trust_class: signalTrustClass,
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
 * Coerces sync/LLM timestamps to UTC ISO strings. Returns null if unparseable.
 * Never throws (avoids RangeError: Invalid time value from toISOString).
 */
export function normalizeInteractionTimestamp(value: unknown): string | null {
  if (value == null || value === '') return null;
  try {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return null;
      const d = new Date(value);
      const t = d.getTime();
      if (!Number.isFinite(t)) return null;
      return d.toISOString();
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      const d = new Date(trimmed);
      if (!Number.isFinite(d.getTime())) return null;
      return d.toISOString();
    }
    if (value instanceof Date) {
      if (!Number.isFinite(value.getTime())) return null;
      return value.toISOString();
    }
    return null;
  } catch {
    return null;
  }
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
      extraction_parse_error: null,
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
    .eq('processed', false);

  if (!options.includeAllSources) {
    countQuery = countQuery.in('source', EXTRACTABLE_SOURCES);
  }

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
    .eq('processed', false);

  if (!options.includeAllSources) {
    signalsQuery = signalsQuery.in('source', EXTRACTABLE_SOURCES);
  }

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
