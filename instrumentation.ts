export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertProductionCoreEnvOrThrow } = await import('@/lib/config/required-env');
    assertProductionCoreEnvOrThrow();

    const { init } = await import('@sentry/nextjs');
    init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: 1.0,
      debug: false,
    });
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    const { init } = await import('@sentry/nextjs');
    init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: 1.0,
      debug: false,
    });
  }
}
