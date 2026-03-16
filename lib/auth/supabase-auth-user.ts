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
  const supabase = createServerClient();

  for (let page = 1; page <= MAX_USER_PAGES; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: USERS_PER_PAGE,
    });

    if (error) {
      throw error;
    }

    const match = data.users.find(
      (user) => normalizeEmail(user.email ?? '') === normalizedEmail,
    );

    if (match?.id) {
      return match.id;
    }

    if (data.users.length < USERS_PER_PAGE) {
      break;
    }
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
    ...(name ? { user_metadata: { name } } : {}),
  });

  if (error) {
    throw error;
  }

  if (!data.user?.id) {
    throw new Error('Failed to create Supabase auth user');
  }

  return data.user.id;
}
