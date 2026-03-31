// ---------------------------------------------------------------------------
// Entity Reality Gate — Pre-filter that drops candidates with unverified entities
//
// No entity should enter the candidate pipeline unless it is grounded in real
// interaction history. Runs post-candidate-build, pre-scoring. Does NOT modify
// generator or mapping — this is a pre-filter only.
// ---------------------------------------------------------------------------

import type { ActionType, GenerationCandidateSource } from './types';
import type { MatchedGoal } from './scorer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EntityGateCandidate {
  id: string;
  type: 'commitment' | 'signal' | 'relationship';
  title: string;
  content: string;
  actionType: ActionType;
  urgency: number;
  matchedGoal: MatchedGoal | null;
  domain: string;
  sourceSignals: GenerationCandidateSource[];
  entityName?: string;
  /** Structured sender/author from the underlying signal record (e.g. "Jane Smith <jane@co.com>").
   *  Used before regex text-extraction so real threads survive the gate even when the entity
   *  name is absent from the decrypted body text. */
  author?: string;
}

export interface EntityRecord {
  name: string;
  total_interactions: number;
  trust_class?: string;
}

export interface SignalRecord {
  content: string;
  source?: string;
  author?: string;
  type?: string;
}

export type EntityDropReason =
  | 'unverified_entity'
  | 'single_appearance_no_email'
  | 'newsletter_promo_source'
  | 'no_entity_detected'
  /** send_message: no email found in structured metadata or text */
  | 'no_external_routing_address'
  /** send_message: routing email resolves to the authenticated user */
  | 'self_addressed'
  /** send_message: entity is an abstract noun / department, not a routable person */
  | 'abstract_target_only';

export interface EntityGateResult {
  passed: EntityGateCandidate[];
  dropped: Array<{
    candidate: EntityGateCandidate;
    entity: string;
    reason: EntityDropReason;
  }>;
  verifiedEntities: string[];
  unverifiedEntities: string[];
}

// ---------------------------------------------------------------------------
// Entity extraction from candidate text
// ---------------------------------------------------------------------------

// Proper name: First Last (capitalized words, 2+ chars each)
const PROPER_NAME_PATTERN = /\b([A-Z][a-z]{1,20}\s+[A-Z][a-z]{1,20}(?:\s+[A-Z][a-z]{1,20})?)\b/g;

// Email address
const EMAIL_PATTERN = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

// Company name with suffix
const COMPANY_PATTERN = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+(?:Inc|LLC|Corp|Ltd|Co|Group|Partners|Capital|Ventures|Labs|Technologies|Solutions))\b/gi;

// Common non-entity proper-noun false positives
const FALSE_POSITIVE_NAMES = new Set([
  'best buy', 'home depot', 'whole foods', 'trader joe',
  'united states', 'new york', 'los angeles', 'san francisco',
  'good morning', 'happy birthday', 'thank you', 'best regards',
  'kind regards', 'looking forward', 'sounds good', 'let me know',
  'please let', 'hope this', 'feel free', 'no worries',
]);

function extractEntitiesFromText(text: string): string[] {
  const entities = new Set<string>();

  // Extract proper names
  for (const match of text.matchAll(PROPER_NAME_PATTERN)) {
    const name = match[1].trim();
    if (!FALSE_POSITIVE_NAMES.has(name.toLowerCase())) {
      entities.add(name.toLowerCase());
    }
  }

  // Extract email domains as entity indicators
  for (const match of text.matchAll(EMAIL_PATTERN)) {
    const email = match[1].toLowerCase();
    // Extract name from email before @
    const localPart = email.split('@')[0].replace(/[._-]/g, ' ');
    if (localPart.length >= 3) {
      entities.add(localPart);
    }
  }

  // Extract company names
  for (const match of text.matchAll(COMPANY_PATTERN)) {
    entities.add(match[1].toLowerCase().trim());
  }

  return [...entities];
}

// ---------------------------------------------------------------------------
// Verification sources
// ---------------------------------------------------------------------------

// Sources that indicate verified interaction (email, calendar)
const VERIFIED_SIGNAL_SOURCES = new Set([
  'gmail', 'outlook', 'microsoft',
  'google_calendar', 'outlook_calendar',
  'google_drive', 'onedrive',
]);

// Promo/newsletter indicators — entities from these are never verified
const PROMO_PATTERNS = [
  /\b(?:newsletter|unsubscribe|email\s+preferences|manage\s+subscriptions)\b/i,
  /\b(?:webinar|masterclass|free\s+(?:trial|demo|download|ebook))\b/i,
  /\b(?:promo(?:tion)?al?|special\s+offer|limited\s+time|sale|discount)\b/i,
  /\b(?:noreply|no-reply|donotreply|mailer[- ]?daemon)\b/i,
];

function isPromoContent(text: string): boolean {
  return PROMO_PATTERNS.some(p => p.test(text));
}

/**
 * Build a set of verified entity names from known entity records and signal history.
 *
 * An entity is verified if ANY of these is true:
 * 1. Appears in tkg_entities with total_interactions >= 2
 * 2. Appears in signal author fields (email sender/recipient)
 * 3. Appears in >= 2 separate signals with consistent context
 * 4. Has a known relationship record (exists in tkg_entities at all)
 */
export function buildVerifiedEntitySet(
  entities: EntityRecord[],
  signals: SignalRecord[],
): Set<string> {
  const verified = new Set<string>();

  // Rule 1 & 4: entities from tkg_entities with interaction history
  for (const e of entities) {
    const nameLower = e.name.toLowerCase().trim();
    if (nameLower === 'self') continue;

    // Rule 4: any entity in tkg_entities is a known relationship
    verified.add(nameLower);

    // Also add first name alone for partial matching
    const firstName = nameLower.split(/\s+/)[0];
    if (firstName.length >= 3) {
      verified.add(firstName);
    }
  }

  // Rule 2: entities from signal author fields (verified email senders)
  for (const s of signals) {
    if (!s.author) continue;

    // Extract name from "Name <email>" format
    const authorMatch = s.author.match(/^([^<]+)</);
    if (authorMatch) {
      const authorName = authorMatch[1].trim().toLowerCase();
      if (authorName.length >= 3 && !FALSE_POSITIVE_NAMES.has(authorName)) {
        verified.add(authorName);
        // First name
        const firstName = authorName.split(/\s+/)[0];
        if (firstName.length >= 3) verified.add(firstName);
      }
    }

    // Extract email local part
    const emailMatch = s.author.match(/([a-zA-Z0-9._%+-]+)@/);
    if (emailMatch) {
      const localPart = emailMatch[1].toLowerCase().replace(/[._-]/g, ' ');
      if (localPart.length >= 3) verified.add(localPart);
    }
  }

  // Rule 3: entities that appear in >= 2 separate signals
  const entitySignalCount = new Map<string, number>();
  for (const s of signals) {
    if (!s.content || isPromoContent(s.content)) continue;

    const signalEntities = extractEntitiesFromText(s.content);
    // Deduplicate per signal — each signal only counts once per entity
    const seen = new Set<string>();
    for (const entity of signalEntities) {
      if (!seen.has(entity)) {
        seen.add(entity);
        entitySignalCount.set(entity, (entitySignalCount.get(entity) ?? 0) + 1);
      }
    }
  }
  for (const [entity, count] of entitySignalCount) {
    if (count >= 2) {
      verified.add(entity);
    }
  }

  return verified;
}

// ---------------------------------------------------------------------------
// Entity verification check for a single candidate
// ---------------------------------------------------------------------------

/**
 * Extract a canonical entity name from a raw author/sender string.
 * Handles "Display Name <email@domain.com>" and plain email formats.
 */
function entityFromAuthor(author: string): string | null {
  if (!author || author.trim().length < 3) return null;
  // "Display Name <email>" — prefer the display name
  const nameAngle = author.match(/^([^<]+)</);
  if (nameAngle) {
    const name = nameAngle[1].trim().toLowerCase();
    if (name.length >= 3 && !FALSE_POSITIVE_NAMES.has(name)) return name;
  }
  // Just "email@domain" — use local part
  const emailLocal = author.match(/([a-zA-Z0-9._%+-]+)@/);
  if (emailLocal) {
    const local = emailLocal[1].toLowerCase().replace(/[._-]/g, ' ');
    if (local.length >= 3) return local;
  }
  // Plain string (no angle brackets, no @)
  const plain = author.trim().toLowerCase();
  return plain.length >= 3 && !FALSE_POSITIVE_NAMES.has(plain) ? plain : null;
}

function findPrimaryEntity(c: EntityGateCandidate): string | null {
  // 1. Explicit entityName — set for relationship candidates and commitment candidates
  //    with a resolved promisor/promisee entity from the DB.
  if (c.entityName) {
    return c.entityName.toLowerCase().trim();
  }

  // 2. Structured author/sender metadata — set for signal candidates from the raw
  //    signal record's author field. Use this BEFORE regex so real threads are not
  //    dropped simply because the entity name is absent from the decrypted body text.
  if (c.author) {
    const fromAuthor = entityFromAuthor(c.author);
    if (fromAuthor) return fromAuthor;
  }

  // 3. Regex fallback — extract from title + content text.
  const extracted = extractEntitiesFromText(`${c.title} ${c.content}`);
  return extracted.length > 0 ? extracted[0] : null;
}

function isEntityVerified(entity: string, verifiedSet: Set<string>): boolean {
  // Direct match
  if (verifiedSet.has(entity)) return true;

  // Check if any verified entity contains this entity or vice versa
  for (const verified of verifiedSet) {
    if (verified.includes(entity) || entity.includes(verified)) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// send_message routing helpers
// ---------------------------------------------------------------------------

// Single-token abstract department/role words — not routable persons.
const ABSTRACT_TARGET_WORDS = new Set([
  'financial', 'finance', 'hr', 'humanresources', 'legal', 'team', 'department',
  'management', 'leadership', 'organization', 'admin', 'administration',
  'billing', 'sales', 'marketing', 'support', 'operations', 'engineering',
  'executive', 'board', 'committee', 'group', 'vendor', 'client', 'customer',
  'accounting', 'payroll', 'procurement', 'compliance', 'security', 'policy',
]);

function isAbstractTarget(entity: string): boolean {
  const lower = entity.toLowerCase().trim().replace(/\s+/g, '');
  if (ABSTRACT_TARGET_WORDS.has(lower)) return true;
  // Two-word phrases like "human resources", "executive team"
  const lowerSpaced = entity.toLowerCase().trim();
  return ABSTRACT_TARGET_WORDS.has(lowerSpaced);
}

/**
 * Extract a routing email for send_message candidates.
 * Priority:
 *   1. Structured author — angle-bracket format (e.g. "Jane <jane@co.com>")
 *   2. Plain email in candidate author string
 *   3. Email in title + content text
 *   4. Signal history author matching the primary entity name
 * Handles complex strings like "Financial Department billing@company.com" by extracting the actual email.
 */
function extractRoutingEmail(
  c: EntityGateCandidate,
  primaryEntity: string,
  signalHistory: SignalRecord[],
): string | null {
  const emailRe = /([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/;
  // 1. Structured author — angle-bracket format first
  if (c.author) {
    const angleBracket = c.author.match(/<([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})>/);
    if (angleBracket) return angleBracket[1].toLowerCase();
    // Plain email anywhere in author string
    const plain = c.author.match(emailRe);
    if (plain) return plain[1].toLowerCase();
  }
  // 2. Free-text fallback — title + content
  const textMatch = `${c.title} ${c.content}`.match(emailRe);
  if (textMatch) return textMatch[1].toLowerCase();
  // 3. Signal history — find a signal whose author matches the primary entity
  const entityTokens = primaryEntity.toLowerCase().split(/\s+/).filter(t => t.length >= 2);
  for (const s of signalHistory) {
    if (!s.author) continue;
    const authorLower = s.author.toLowerCase();
    // Require all entity name tokens to appear in the author string
    if (entityTokens.length > 0 && entityTokens.every(t => authorLower.includes(t))) {
      const angleBracket = s.author.match(/<([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})>/);
      if (angleBracket) return angleBracket[1].toLowerCase();
      const plain = s.author.match(emailRe);
      if (plain) return plain[1].toLowerCase();
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main gate
// ---------------------------------------------------------------------------

export function applyEntityRealityGate(
  candidates: EntityGateCandidate[],
  knownEntities: EntityRecord[],
  signalHistory: SignalRecord[],
  /** User's own email addresses — used to block self-addressed send_message candidates */
  userEmails?: Set<string>,
): EntityGateResult {
  const verifiedSet = buildVerifiedEntitySet(knownEntities, signalHistory);
  const verifiedEntities: string[] = [...verifiedSet];
  const unverifiedEntities: string[] = [];
  const passed: EntityGateCandidate[] = [];
  const dropped: EntityGateResult['dropped'] = [];

  for (const c of candidates) {
    const text = `${c.title} ${c.content}`;

    // Newsletter/promo content — instant drop
    if (isPromoContent(text)) {
      const entity = findPrimaryEntity(c) ?? '(promo)';
      dropped.push({ candidate: c, entity, reason: 'newsletter_promo_source' });
      if (!unverifiedEntities.includes(entity)) unverifiedEntities.push(entity);
      continue;
    }

    const primaryEntity = findPrimaryEntity(c);

    // No entity detected — drop (candidates must be entity-grounded)
    if (!primaryEntity) {
      dropped.push({ candidate: c, entity: '(none)', reason: 'no_entity_detected' });
      continue;
    }

    // Check verification
    if (isEntityVerified(primaryEntity, verifiedSet)) {
      // 4. For send_message: require a routable, non-self external email address.
      //    Name-only and abstract department targets are not sufficient.
      //    Discrepancy candidates bypass this gate entirely (added post-scoring).
      if (c.actionType === 'send_message') {
        // Drop abstract/department nouns — they can never resolve to a routable person.
        // (e.g. "Financial", "HR Team", "Management") — not real recipients.
        if (isAbstractTarget(primaryEntity)) {
          dropped.push({ candidate: c, entity: primaryEntity, reason: 'abstract_target_only' });
          if (!unverifiedEntities.includes(primaryEntity)) unverifiedEntities.push(primaryEntity);
          continue;
        }
        // If a routing email IS resolvable at gate time (from author or text), check
        // that it is not the user's own address. Real-person candidates without an
        // email in candidate text are allowed through — hydration fetches the email
        // from the entity DB, and isSendWorthy() handles the final self-addressed check.
        const routingEmail = extractRoutingEmail(c, primaryEntity, signalHistory);
        if (routingEmail && userEmails && userEmails.size > 0 && userEmails.has(routingEmail)) {
          dropped.push({ candidate: c, entity: primaryEntity, reason: 'self_addressed' });
          if (!unverifiedEntities.includes(primaryEntity)) unverifiedEntities.push(primaryEntity);
          continue;
        }
      }
      passed.push(c);
      continue;
    }

    // Unverified entity — check if it has email/domain evidence in THIS candidate
    const hasEmailInContent = EMAIL_PATTERN.test(text);
    EMAIL_PATTERN.lastIndex = 0; // Reset regex state

    if (!hasEmailInContent) {
      // Single appearance with no email → drop
      dropped.push({ candidate: c, entity: primaryEntity, reason: 'single_appearance_no_email' });
      if (!unverifiedEntities.includes(primaryEntity)) unverifiedEntities.push(primaryEntity);
      continue;
    }

    // Has email but entity not in verified set → still unverified
    dropped.push({ candidate: c, entity: primaryEntity, reason: 'unverified_entity' });
    if (!unverifiedEntities.includes(primaryEntity)) unverifiedEntities.push(primaryEntity);
  }

  return { passed, dropped, verifiedEntities, unverifiedEntities };
}
