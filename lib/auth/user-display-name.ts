/**
 * Resolve display names for prompts and artifacts from Supabase Auth metadata.
 * Used by the generator (structured context) so copy is never hardcoded to one account.
 */

import { createServerClient } from '@/lib/db/client';

export interface UserPromptNames {
  /** Full display name for "from X" lines; falls back to email heuristic or "the user". */
  user_full_name: string;
  /** First token of full name, title-cased; empty when unknown (caller uses "you" in prose). */
  user_first_name: string;
}

function longestEmailLocalToken(local: string): string | null {
  const segments = local.split(/[.\-]+/).filter(Boolean);
  let best: string | null = null;
  let bestLen = 0;
  for (const seg of segments) {
    const alpha = seg.replace(/\d+$/, '').toLowerCase();
    if (alpha.length >= 3 && alpha.length >= bestLen) {
      if (alpha.length > bestLen) {
        bestLen = alpha.length;
        best = alpha;
      }
    }
  }
  return best;
}

function capitalizeWord(w: string): string {
  if (!w) return w;
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/**
 * Reads user_metadata.full_name, user_metadata.name, then provider identity_data;
 * then longest alphabetic segment (3+ chars) from email local part.
 */
export async function resolveUserPromptNames(userId: string): Promise<UserPromptNames> {
  try {
    const supabase = createServerClient();
    const { data } = await supabase.auth.admin.getUserById(userId);
    const user = data?.user;
    if (!user) {
      return { user_full_name: 'the user', user_first_name: '' };
    }

    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    let full: string | null = null;
    if (typeof meta.full_name === 'string' && meta.full_name.trim()) {
      full = meta.full_name.trim();
    } else if (typeof meta.name === 'string' && meta.name.trim()) {
      full = meta.name.trim();
    }

    if (!full) {
      for (const identity of user.identities ?? []) {
        const idData = (identity.identity_data ?? {}) as Record<string, unknown>;
        if (typeof idData.full_name === 'string' && idData.full_name.trim()) {
          full = idData.full_name.trim();
          break;
        }
        if (typeof idData.name === 'string' && idData.name.trim()) {
          full = idData.name.trim();
          break;
        }
      }
    }

    if (!full && user.email) {
      const local = user.email.split('@')[0] ?? '';
      const token = longestEmailLocalToken(local);
      if (token) full = capitalizeWord(token);
    }

    if (!full) {
      return { user_full_name: 'the user', user_first_name: '' };
    }

    const firstRaw = full.split(/\s+/)[0] ?? '';
    const user_first_name = firstRaw ? capitalizeWord(firstRaw) : '';

    return {
      user_full_name: full,
      user_first_name,
    };
  } catch {
    return { user_full_name: 'the user', user_first_name: '' };
  }
}
