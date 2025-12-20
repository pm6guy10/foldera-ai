// =====================================================
// API RATE LIMITING & RETRY LOGIC
// Exponential backoff for Gmail/Outlook APIs
// =====================================================

import pRetry from 'p-retry';
import { logger } from '../observability/logger';

interface RetryOptions {
  retries?: number;
  minTimeout?: number;
  maxTimeout?: number;
  onFailedAttempt?: (error: Error) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  retries: 5,
  minTimeout: 1000,
  maxTimeout: 30000,
  onFailedAttempt: (error) => {
    logger.warn('API call failed, retrying...', {
      attempt: error.attemptNumber,
      retriesLeft: error.retriesLeft,
      message: error.message,
    });
  },
};

/**
 * Execute a function with exponential backoff retry logic
 * Handles rate limiting (429) and transient errors
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return pRetry(
    async () => {
      try {
        return await fn();
      } catch (error: any) {
        // Check if it's a rate limit error
        if (error?.response?.status === 429 || error?.status === 429) {
          throw new Error('Rate limited');
        }

        // Check if it's a retryable error (5xx)
        if (error?.response?.status >= 500 || error?.status >= 500) {
          throw error;
        }

        // For 4xx errors (except 429), don't retry
        if (error?.response?.status >= 400 && error?.response?.status < 500) {
          throw new pRetry.AbortError(error);
        }

        // For network errors, retry
        throw error;
      }
    },
    {
      retries: opts.retries,
      minTimeout: opts.minTimeout,
      maxTimeout: opts.maxTimeout,
      onFailedAttempt: opts.onFailedAttempt,
    }
  );
}

/**
 * Fetch with automatic retry logic
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions?: RetryOptions
): Promise<Response> {
  return withRetry(
    async () => {
      const response = await fetch(url, options);

      if (response.status === 429) {
        throw new Error('Rate limited');
      }

      if (response.status >= 500) {
        throw new Error(`Server error: ${response.status}`);
      }

      if (!response.ok && response.status < 500) {
        throw new pRetry.AbortError(new Error(`Client error: ${response.status}`));
      }

      return response;
    },
    retryOptions
  );
}

