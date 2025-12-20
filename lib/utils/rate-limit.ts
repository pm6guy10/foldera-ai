interface RateLimitConfig {
  limit: number;      // Max requests
  window: number;     // Time window in seconds
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: Date;
}

// In-memory store (replace with Redis in production)
const store = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(
  identifier: string,
  config: RateLimitConfig = { limit: 10, window: 60 }
): Promise<RateLimitResult> {
  const now = Date.now();
  const key = identifier;
  const windowMs = config.window * 1000;

  const existing = store.get(key);

  if (!existing || now > existing.resetAt) {
    // New window
    store.set(key, { count: 1, resetAt: now + windowMs });
    return {
      success: true,
      remaining: config.limit - 1,
      resetAt: new Date(now + windowMs),
    };
  }

  if (existing.count >= config.limit) {
    // Rate limited
    return {
      success: false,
      remaining: 0,
      resetAt: new Date(existing.resetAt),
    };
  }

  // Increment counter
  existing.count++;
  store.set(key, existing);

  return {
    success: true,
    remaining: config.limit - existing.count,
    resetAt: new Date(existing.resetAt),
  };
}

// Cleanup old entries periodically (call this from a cron or on each request)
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (now > value.resetAt) {
      store.delete(key);
    }
  }
}

