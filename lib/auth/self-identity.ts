import { createServerClient } from '@/lib/db/client';

export interface SelfIdentity {
  selfEmails: Set<string>;
  selfNameTokens: string[];
}

export async function resolveSelfIdentity(userId: string): Promise<SelfIdentity> {
  const supabase = createServerClient();
  const selfEmails = new Set<string>();
  const selfNameTokens: string[] = [];

  try {
    const { data: authUserData } = await supabase.auth.admin.getUserById(userId);
    const authUser = authUserData?.user;
    if (authUser?.email) selfEmails.add(authUser.email.toLowerCase());

    for (const identity of authUser?.identities ?? []) {
      const identityData = identity.identity_data as Record<string, unknown> | undefined;
      const email = identityData?.email;
      if (typeof email === 'string' && email.trim()) {
        selfEmails.add(email.trim().toLowerCase());
      }
      const given = identityData?.given_name;
      const family = identityData?.family_name;
      for (const token of [given, family]) {
        if (typeof token !== 'string') continue;
        for (const part of token.toLowerCase().split(/\s+/)) {
          if (part.length >= 2 && !selfNameTokens.includes(part)) selfNameTokens.push(part);
        }
      }
    }

    const meta = authUser?.user_metadata as Record<string, unknown> | undefined;
    const fullName = (meta?.full_name ?? meta?.name ?? '') as string;
    if (fullName) {
      for (const token of fullName.toLowerCase().split(/\s+/)) {
        if (token.length >= 2 && !selfNameTokens.includes(token)) selfNameTokens.push(token);
      }
    }

    const { data: connectorEmailRows } = await supabase
      .from('user_tokens')
      .select('email')
      .eq('user_id', userId)
      .in('provider', ['google', 'microsoft']);

    for (const row of connectorEmailRows ?? []) {
      const email = row.email as string | null | undefined;
      if (typeof email === 'string' && email.trim()) {
        selfEmails.add(email.trim().toLowerCase());
      }
    }
  } catch {
    // Non-blocking — empty identity just means downstream repair/reporting is conservative.
  }

  return { selfEmails, selfNameTokens };
}
