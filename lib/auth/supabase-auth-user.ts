import { createServerClient } from '@/lib/db/client';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Resolve or create a Supabase auth user by email.
 *
 * Primary: calls get_auth_user_id_by_email RPC (direct SQL on auth.users).
 * Fallback: admin.listUsers pagination (fragile — GoTrue NULL column scan bug).
 * Create: admin.createUser if no match found.
 */
export async function resolveSupabaseAuthUserId(
  email: string,
  name?: string | null,
): Promise<string> {
  const normalizedEmail = normalizeEmail(email);
  console.log(`[supabase-auth] resolving user for email: ${normalizedEmail}`);
  const supabase = createServerClient();

  // Primary: RPC function avoids GoTrue listUsers NULL column scan bug
  try {
    const { data, error } = await supabase.rpc('get_auth_user_id_by_email', {
      lookup_email: normalizedEmail,
    });

    if (!error && data) {
      console.log(`[supabase-auth] found user ${data} via RPC for ${normalizedEmail}`);
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
        console.log(`[supabase-auth] found user ${match.id} via listUsers for ${normalizedEmail}`);
        return match.id;
      }
    } else if (error) {
      console.warn(`[supabase-auth] listUsers failed: ${error.message}`);
    }
  } catch (listErr: any) {
    console.warn(`[supabase-auth] listUsers threw: ${listErr.message}`);
  }

  // No existing user — create one
  console.log(`[supabase-auth] no existing user found for ${normalizedEmail}, creating...`);

  const { data, error } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
    ...(name ? { user_metadata: { name } } : {}),
  });

  if (error) {
    console.error(`[supabase-auth] createUser failed for ${normalizedEmail}:`, error.message);
    throw error;
  }

  if (!data.user?.id) {
    throw new Error('Failed to create Supabase auth user');
  }

  console.log(`[supabase-auth] created user ${data.user.id} for ${normalizedEmail}`);
  return data.user.id;
}
