import type { User } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/db/client';

const AUTH_ADMIN_USER_CACHE_TTL_MS = 60_000;

type CacheEntry = {
  expiresAt: number;
  promise: Promise<User | null>;
};

const authAdminUserCache = new Map<string, CacheEntry>();

export function clearAuthAdminUserCacheForTests(): void {
  authAdminUserCache.clear();
}

export async function getAuthAdminUserCached(userId: string): Promise<User | null> {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) return null;

  const now = Date.now();
  const existing = authAdminUserCache.get(trimmedUserId);
  if (existing && existing.expiresAt > now) {
    return existing.promise;
  }

  const promise = (async () => {
    try {
      const supabase = createServerClient();
      const { data, error } = await supabase.auth.admin.getUserById(trimmedUserId);
      if (error) return null;
      return data.user ?? null;
    } catch {
      return null;
    }
  })();

  authAdminUserCache.set(trimmedUserId, {
    expiresAt: now + AUTH_ADMIN_USER_CACHE_TTL_MS,
    promise,
  });

  void promise.then((user) => {
    if (user) return;
    const current = authAdminUserCache.get(trimmedUserId);
    if (current?.promise === promise) authAdminUserCache.delete(trimmedUserId);
  });

  return promise;
}
