const req=[
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'SENTRY_DSN',
  'OTEL_EXPORTER_OTLP_ENDPOINT'
];
const miss=req.filter(k=>!process.env[k]);
if(miss.length){ console.error('Missing envs:', miss.join(', ')); process.exit(1); }
console.log('Preflight OK');
