/**
 * Quick check before brain-receipt (agent or CI prep).
 * Exit 0 if auth state exists; exit 1 with hints otherwise.
 */
import fs from 'node:fs';
import path from 'path';

const statePath = path.join(__dirname, 'auth-state-owner.json');
const envPath = path.resolve(process.cwd(), '.env.local');

function main() {
  const hasState = fs.existsSync(statePath);
  const hasEnv = fs.existsSync(envPath);
  const base =
    process.env.LOCAL_BASE_URL?.replace(/\/$/, '') ??
    process.env.NEXTAUTH_URL?.replace(/\/$/, '') ??
    'http://localhost:3000';

  console.log('[test:local:check] LOCAL_BASE_URL / default:', base);
  console.log('[test:local:check] .env.local:', hasEnv ? 'present' : 'MISSING');
  console.log('[test:local:check] auth-state-owner.json:', hasState ? 'present' : 'MISSING');

  if (!hasEnv) {
    console.warn('[test:local:check] Warning: .env.local missing — dev server may fail.');
  }

  if (!hasState) {
    console.log('\n[test:local:check] Next steps:');
    console.log('  1. ALLOW_DEV_ROUTES=true npm run dev  (match port to LOCAL_BASE_URL if not 3000)');
    console.log('  2. npm run test:local:setup  — sign in as owner when browser opens');
    console.log('  3. npm run test:local:brain-receipt\n');
    process.exit(1);
  }

  console.log('[test:local:check] OK — run: npm run test:local:brain-receipt (with dev server + ALLOW_DEV_ROUTES=true)');
  process.exit(0);
}

main();
