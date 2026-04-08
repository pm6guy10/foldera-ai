export async function register() {
  const { init } = await import('@sentry/nextjs');
  const {
    sentryDropTransientSocketEvents,
    SENTRY_TRANSIENT_SOCKET_IGNORE_MESSAGES,
  } = await import('@/lib/sentry/transient-socket-errors');

  const sentryBase = {
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 1.0,
    debug: false,
    ignoreErrors: [...SENTRY_TRANSIENT_SOCKET_IGNORE_MESSAGES],
    beforeSend: sentryDropTransientSocketEvents,
  };

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertProductionCoreEnvOrThrow } = await import('@/lib/config/required-env');
    assertProductionCoreEnvOrThrow();

    init(sentryBase);
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    init(sentryBase);
  }
}
