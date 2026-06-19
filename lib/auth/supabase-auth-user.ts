import { createServerClient } from '@/lib/db/client';
import type { SupabaseClient } from '@/lib/db/client';
import { authDebugLog } from '@/lib/auth/auth-debug';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isAlreadyRegisteredError(error: { message?: string; code?: string; status?: number }): boolean {
  if (error.code === 'email_exists') return true;
  return /already (?:been )?registered|already exists/i.test(error.message ?? '');
}

async function lookupAuthUserIdByEmail(
  supabase: SupabaseClient,
  normalizedEmail: string,
): Promise<string | null> {
  // Primary: RPC function avoids GoTrue listUsers NULL column scan bug
  try {
    const { data, error } = await supabase.rpc('get_auth_user_id_by_email', {
      lookup_email: normalizedEmail,
    });

    if (!error && data) {
      authDebugLog(`[supabase-auth] found user ${data} via RPC for ${normalizedEmail}`);
      return data as string;
    }

    if (error) {
      console.warn(`[supabase-auth] RPC lookup failed: ${error.message}`);
    }
  } catch (rpcErr: any) {
    console.warn(`[supabase-auth] RPC threw: ${rpcErr.message}`);
  }

  // Fallback: admin.listUsers (may fail if NULL token columns exist)
  try {
    const { data, error } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });

    if (!error && data?.users) {
      const match = data.users.find(
        (user) => normalizeEmail(user.email ?? '') === normalizedEmail,
      );
      if (match?.id) {
        authDebugLog(`[supabase-auth] found user ${match.id} via listUsers for ${normalizedEmail}`);
        return match.id;
      }
    } else if (error) {
      console.warn(`[supabase-auth] listUsers failed: ${error.message}`);
    }
  } catch (listErr: any) {
    console.warn(`[supabase-auth] listUsers threw: ${listErr.message}`);
  }

  return null;
}

/**
 * Resolve or create a Supabase auth user by email.
 *
 * Primary: calls get_auth_user_id_by_email RPC (direct SQL on auth.users).
 * Fallback: admin.listUsers pagination (fragile — GoTrue NULL column scan bug).
 * Create: admin.createUser if no match found.
 * Recovery: if createUser reports the email is already registered, the earlier
 * lookups failed transiently — re-run the lookup instead of failing sign-in.
 */
export async function resolveSupabaseAuthUserId(
  email: string,
  name?: string | null,
): Promise<string> {
  const normalizedEmail = normalizeEmail(email);
  authDebugLog(`[supabase-auth] resolving user for email: ${normalizedEmail}`);
  const supabase = createServerClient();

  const existingId = await lookupAuthUserIdByEmail(supabase, normalizedEmail);
  if (existingId) return existingId;

  // No existing user — create one
  authDebugLog(`[supabase-auth] no existing user found for ${normalizedEmail}, creating...`);

  const { data, error } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
    ...(name ? { user_metadata: { name } } : {}),
  });

  if (error) {
    if (isAlreadyRegisteredError(error)) {
      // The user exists but both lookups failed transiently. One more lookup
      // keeps an existing owner signed in instead of hard-failing the session.
      console.warn('[supabase-auth] createUser reports email already registered; retrying lookup');
      const recoveredId = await lookupAuthUserIdByEmail(supabase, normalizedEmail);
      if (recoveredId) return recoveredId;
    }
    console.error('[supabase-auth] createUser failed:', error.message);
    throw error;
  }

  if (!data.user?.id) {
    throw new Error('Failed to create Supabase auth user');
  }

  authDebugLog(`[supabase-auth] created user ${data.user.id} for ${normalizedEmail}`);
  return data.user.id;
}
