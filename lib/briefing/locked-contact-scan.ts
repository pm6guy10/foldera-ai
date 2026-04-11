/**
 * Post-LLM locked-contact enforcement: only user-visible brief text (mirrors
 * renderArtifactHtml in lib/email/resend.ts). Avoids false positives from raw
 * JSON keys / structure.
 */

/** Replacement when scrubbing locked display names from persisted user-facing text. */
export const LOCKED_CONTACT_ARTIFACT_PLACEHOLDER = 'a withheld contact';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Removes locked display names from free text using the same token/phrase
 * notion as `findLockedContactsInUserFacingPayload` (word boundaries, length≥3 tokens).
 * Longer names are applied first so multi-word rows win over shared given names.
 */
export function sanitizeStringForLockedContactDisplayNames(text: string, lockedContactPromptLines: string[]): string {
  if (!text || lockedContactPromptLines.length === 0) return text;
  const names = [...lockedContactPromptLines]
    .map((l) => l.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  let out = text;
  for (const displayName of names) {
    const parts = displayName.split(/\s+/).filter((p) => p.length > 0);
    if (parts.length >= 2) {
      const phrase = parts.map(escapeRegExp).join('\\s+');
      out = out.replace(new RegExp(`\\b${phrase}\\b`, 'gi'), LOCKED_CONTACT_ARTIFACT_PLACEHOLDER);
    } else if (parts.length === 1) {
      const p = parts[0];
      if (p.length >= 3) {
        out = out.replace(new RegExp(`\\b${escapeRegExp(p)}\\b`, 'gi'), LOCKED_CONTACT_ARTIFACT_PLACEHOLDER);
      }
    }
  }
  return out;
}

function sanitizeStringValuesInObjectInPlace(node: unknown, lockedLines: string[], depth: number): boolean {
  if (lockedLines.length === 0 || depth > 10) return false;
  if (Array.isArray(node)) {
    let changed = false;
    for (let i = 0; i < node.length; i++) {
      const el = node[i];
      if (typeof el === 'string') {
        const n = sanitizeStringForLockedContactDisplayNames(el, lockedLines);
        if (n !== el) {
          node[i] = n;
          changed = true;
        }
      } else if (el && typeof el === 'object') {
        if (sanitizeStringValuesInObjectInPlace(el, lockedLines, depth + 1)) changed = true;
      }
    }
    return changed;
  }
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    let changed = false;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'string') {
        const n = sanitizeStringForLockedContactDisplayNames(v, lockedLines);
        if (n !== v) {
          o[k] = n;
          changed = true;
        }
      } else if (v && typeof v === 'object') {
        if (sanitizeStringValuesInObjectInPlace(v, lockedLines, depth + 1)) changed = true;
      }
    }
    return changed;
  }
  return false;
}

/**
 * Mutates `payload.directive` and any string fields on `payload.artifact` (recursive)
 * so post-LLM text matches privacy constraints. Returns whether anything changed.
 */
export function sanitizeConvictionPayloadLockedContactsInPlace(
  payload: { directive: string; artifact: unknown },
  lockedContactPromptLines: string[],
): boolean {
  if (lockedContactPromptLines.length === 0) return false;
  let changed = false;
  const nextDirective = sanitizeStringForLockedContactDisplayNames(payload.directive, lockedContactPromptLines);
  if (nextDirective !== payload.directive) {
    payload.directive = nextDirective;
    changed = true;
  }
  if (payload.artifact && typeof payload.artifact === 'object') {
    if (sanitizeStringValuesInObjectInPlace(payload.artifact, lockedContactPromptLines, 0)) changed = true;
  }
  return changed;
}

function lockedContactTokenAppearsInText(haystackLower: string, tokenLower: string): boolean {
  if (!tokenLower) return false;
  if (tokenLower.length < 3) return haystackLower.includes(tokenLower);
  const escaped = tokenLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(haystackLower);
}

export function userFacingArtifactTextForLockedScan(artifact: unknown): string {
  if (artifact == null) return '';
  if (typeof artifact !== 'object') return String(artifact).toLowerCase();
  const a = artifact as Record<string, unknown>;
  const t = String(a.type ?? '');
  const parts: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) parts.push(v.trim());
  };
  switch (t) {
    case 'email':
      push(a.to);
      push(a.subject);
      push(a.body);
      break;
    case 'document':
      push(a.title);
      push(a.content);
      break;
    case 'calendar_event':
      push(a.title);
      push(a.start);
      push(a.end);
      push(a.description);
      break;
    case 'research_brief':
      push(a.findings);
      push(a.recommended_action);
      if (Array.isArray(a.sources)) {
        for (const s of a.sources) {
          if (typeof s === 'string') push(s);
        }
      }
      break;
    case 'decision_frame':
      push(a.recommendation);
      if (Array.isArray(a.options)) {
        for (const o of a.options) {
          if (o && typeof o === 'object') {
            const opt = o as Record<string, unknown>;
            push(opt.option);
            push(opt.rationale);
          }
        }
      }
      push(typeof a.context === 'string' ? a.context : null);
      break;
    default:
      return JSON.stringify(artifact).toLowerCase();
  }
  return parts.join('\n').toLowerCase();
}

/** Returns locked display names that appear in directive + user-facing artifact text. */
export function findLockedContactsInUserFacingPayload(
  lockedContactPromptLines: string[],
  directiveLower: string,
  artifact: unknown,
): string[] {
  const artifactText = userFacingArtifactTextForLockedScan(artifact);
  const combinedText = `${directiveLower} ${artifactText}`;
  const violatingContacts: string[] = [];
  for (const contactName of lockedContactPromptLines) {
    const tokens = contactName.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
    if (tokens.length === 0) {
      const c = contactName.toLowerCase().trim();
      if (c.length >= 3) {
        if (lockedContactTokenAppearsInText(combinedText, c)) violatingContacts.push(contactName);
      } else if (c.length > 0 && combinedText.includes(c)) {
        violatingContacts.push(contactName);
      }
    } else if (tokens.every((token) => lockedContactTokenAppearsInText(combinedText, token))) {
      violatingContacts.push(contactName);
    }
  }
  return violatingContacts;
}
