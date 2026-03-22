import { createServerClient } from '@/lib/db/client';

const USERS_PER_PAGE = 200;
const MAX_USER_PAGES = 10;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function resolveSupabaseAuthUserId(
  email: string,
  name?: string | null,
): Promise<string> {
  const normalizedEmail = normalizeEmail(email);
  console.log(`[supabase-auth] resolving user for email: ${normalizedEmail}`);
  const supabase = createServerClient();

  for (let page = 1; page <= MAX_USER_PAGES; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: USERS_PER_PAGE,
    });

    if (error) {
      console.error(`[supabase-auth] listUsers page ${page} failed:`, error.message);
      throw error;
    }

    console.log(`[supabase-auth] listUsers page ${page}: ${data.users.length} users`);

    const match = data.users.find(
      (user) => normalizeEmail(user.email ?? '') === normalizedEmail,
    );

    if (match?.id) {
      console.log(`[supabase-auth] found user ${match.id} for ${normalizedEmail}`);
      return match.id;
    }

    if (data.users.length < USERS_PER_PAGE) {
      break;
    }
  }

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
