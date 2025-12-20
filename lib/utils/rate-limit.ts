// =====================================================
// RATE LIMITING
// Protects API routes from abuse
// =====================================================

import { NextRequest } from 'next/server';
import { logger } from '../observability/logger';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetAt: number;
  };
}

// In-memory store (for single-instance deployments)
// For multi-instance, use Redis or Upstash
const rateLimitStore: RateLimitStore = {};

interface RateLimitOptions {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  identifier?: string; // Custom identifier (defaults to IP)
}

/**
 * Rate limit check
 * Returns true if request should be allowed, false if rate limited
 */
export function checkRateLimit(
  request: NextRequest,
  options: RateLimitOptions
): { allowed: boolean; remaining: number; resetAt: number } {
  const { windowMs, maxRequests, identifier } = options;
  
  // Get identifier (IP address or custom)
  const key = identifier || getClientIP(request);
  const now = Date.now();
  
  // Get or create rate limit entry
  let entry = rateLimitStore[key];
  
  if (!entry || now > entry.resetAt) {
    // Create new window
    entry = {
      count: 0,
      resetAt: now + windowMs,
    };
    rateLimitStore[key] = entry;
  }
  
  entry.count++;
  
  const remaining = Math.max(0, maxRequests - entry.count);
  const allowed = entry.count <= maxRequests;
  
  if (!allowed) {
    logger.warn('Rate limit exceeded', {
      key,
      count: entry.count,
      maxRequests,
      windowMs,
      path: request.nextUrl.pathname,
    });
  }
  
  // Cleanup old entries (simple cleanup every 100 requests)
  if (Math.random() < 0.01) {
    cleanupExpiredEntries(now);
  }
  
  return {
    allowed,
    remaining,
    resetAt: entry.resetAt,
  };
}

/**
 * Get client IP address
 */
function getClientIP(request: NextRequest): string {
  // Check various headers for IP (Vercel, Cloudflare, etc.)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  
  // Fallback to connection remote address (not available in Next.js)
  return 'unknown';
}

/**
 * Cleanup expired rate limit entries
 */
function cleanupExpiredEntries(now: number): void {
  const keys = Object.keys(rateLimitStore);
  for (const key of keys) {
    if (now > rateLimitStore[key].resetAt) {
      delete rateLimitStore[key];
    }
  }
}

/**
 * Rate limit middleware for API routes
 */
export function withRateLimit(
  options: RateLimitOptions
) {
  return (handler: (request: NextRequest) => Promise<Response>) => {
    return async (request: NextRequest): Promise<Response> => {
      const { allowed, remaining, resetAt } = checkRateLimit(request, options);
      
      if (!allowed) {
        return new Response(
          JSON.stringify({
            error: 'Rate limit exceeded',
            retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': options.maxRequests.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': resetAt.toString(),
              'Retry-After': Math.ceil((resetAt - Date.now()) / 1000).toString(),
            },
          }
        );
      }
      
      const response = await handler(request);
      
      // Add rate limit headers
      response.headers.set('X-RateLimit-Limit', options.maxRequests.toString());
      response.headers.set('X-RateLimit-Remaining', remaining.toString());
      response.headers.set('X-RateLimit-Reset', resetAt.toString());
      
      return response;
    };
  };
}

