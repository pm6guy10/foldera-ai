#!/usr/bin/env node

const required = [
  'ANTHROPIC_API_KEY',
  'CRON_SECRET',
  'ENCRYPTION_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error('Missing envs:', missing.join(', '));
  process.exit(1);
}

console.log('Preflight OK');
