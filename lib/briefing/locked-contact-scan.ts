/**
 * Post-LLM locked-contact enforcement: only user-visible brief text (mirrors
 * renderArtifactHtml in lib/email/resend.ts). Avoids false positives from raw
 * JSON keys / structure.
 */

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
