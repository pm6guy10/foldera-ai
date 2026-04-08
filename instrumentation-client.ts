import * as Sentry from '@sentry/nextjs';
import {
  sentryDropTransientSocketEvents,
  SENTRY_TRANSIENT_SOCKET_IGNORE_MESSAGES,
} from '@/lib/sentry/transient-socket-errors';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  tracesSampleRate: 1.0,
  debug: false,
  ignoreErrors: [...SENTRY_TRANSIENT_SOCKET_IGNORE_MESSAGES],
  beforeSend: sentryDropTransientSocketEvents,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
