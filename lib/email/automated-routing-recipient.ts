/**
 * Detects platform workflow / task-routing addresses that look like mailboxes
 * but are not approvable human recipients for send_message.
 */

/**
 * Returns true when `email` is a known automated routing id (not a real person).
 * Keep patterns narrow — prefer local-part + domain pairs over whole-domain blocks.
 */
export function isAutomatedRoutingRecipient(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return false;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);

  // Outlier task / workflow inboxes (e.g. wfe-<id>@outlier.ai) — live slip Apr 2026
  if (domain === 'outlier.ai' && local.startsWith('wfe-')) return true;

  // Outlier community / campaign / events inboxes — not 1:1 human peers for send_message
  if (domain === 'outlier.ai') {
    const baseLocal = local.split('+')[0]?.split('-')[0] ?? local;
    if (
      ['community', 'notifications', 'events', 'marketing', 'news'].includes(baseLocal)
      || local.startsWith('notify')
    ) {
      return true;
    }
  }

  return false;
}
