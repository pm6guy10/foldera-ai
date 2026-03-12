import { readFileSync, writeFileSync } from 'fs';

// Replacement block for resolveUser
const RESOLVE_USER = `  const auth = await resolveUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;`;

// Replacement block for resolveCronUser
const RESOLVE_CRON = `  const auth = resolveCronUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;`;

// Replacement block for validateCronAuth
const VALIDATE_CRON = `  const authErr = validateCronAuth(req);
  if (authErr) return authErr;`;

function fix(path, transformer) {
  const orig = readFileSync(path, 'utf8');
  const result = transformer(orig);
  if (result !== orig) {
    writeFileSync(path, result, 'utf8');
    console.log('updated:', path);
  } else {
    console.log('NO CHANGE:', path);
  }
}

function removeAuthImports(src) {
  return src
    .replace(/import \{ getServerSession \}[\s]+from 'next-auth';\r?\n/, '')
    .replace(/import \{ getServerSession \} from 'next-auth';\r?\n/, '')
    .replace(/import \{ getAuthOptions \}[\s]+from '@\/lib\/auth\/auth-options';\r?\n/, '')
    .replace(/import \{ getAuthOptions \} from '@\/lib\/auth\/auth-options';\r?\n/, '')
    .replace(/import \{ authOptions \} from '@\/lib\/auth\/auth-options';\r?\n/, '');
}

function addResolveUserImport(src) {
  if (src.includes("from '@/lib/auth/resolve-user'")) return src;
  return src.replace(/^(import .+\r?\n)/m, `$1import { resolveUser } from '@/lib/auth/resolve-user';\n`);
}

function addResolveCronImport(src) {
  if (src.includes("from '@/lib/auth/resolve-user'")) return src;
  return src.replace(/^(import .+\r?\n)/m, `$1import { resolveCronUser } from '@/lib/auth/resolve-user';\n`);
}

function addValidateCronImport(src) {
  if (src.includes("from '@/lib/auth/resolve-user'")) return src;
  return src.replace(/^(import .+\r?\n)/m, `$1import { validateCronAuth } from '@/lib/auth/resolve-user';\n`);
}

// ─── Hybrid auth (x-ingest-secret OR session → INGEST_USER_ID) ───────────────

// Type A: (request as any).headers?.get style
const typeAPattern = /  let userId: string \| undefined;\r?\n  const ingestSecret = \(request as any\)\.headers\?\.get\r?\n    \? \(request as any\)\.headers\.get\('x-ingest-secret'\)\r?\n    : null;\r?\n  if \(ingestSecret\) \{\r?\n    if \(ingestSecret !== process\.env\.INGEST_API_KEY\) \{\r?\n      return NextResponse\.json\(\{ error: 'Invalid ingest secret' \}, \{ status: 401 \}\);\r?\n    \}\r?\n    userId = process\.env\.INGEST_USER_ID;\r?\n  \} else \{\r?\n    const session = await getServerSession\(getAuthOptions\(\)\);\r?\n    if \(!session\?\.user\?\.id\) \{\r?\n      return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\);\r?\n    \}\r?\n    userId = process\.env\.INGEST_USER_ID \?\? session\.user\.id;\r?\n  \}\r?\n\r?\n  if \(!userId\) \{\r?\n    return NextResponse\.json\(\{ error: 'User ID not resolved' \}, \{ status: 500 \}\);\r?\n  \}/;

// Type B: request.headers.get with blank line between let and const
const typeBPattern = /  let userId: string \| undefined;\r?\n\r?\n  const ingestSecret = request\.headers\.get\('x-ingest-secret'\);\r?\n  if \(ingestSecret\) \{\r?\n    if \(ingestSecret !== process\.env\.INGEST_API_KEY\) \{\r?\n      return NextResponse\.json\(\{ error: 'Invalid ingest secret' \}, \{ status: 401 \}\);\r?\n    \}\r?\n    userId = process\.env\.INGEST_USER_ID;\r?\n  \} else \{\r?\n    const session = await getServerSession\(getAuthOptions\(\)\);\r?\n    if \(!session\?\.user\?\.id\) \{\r?\n      return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\);\r?\n    \}\r?\n    userId = process\.env\.INGEST_USER_ID \?\? session\.user\.id;\r?\n  \}\r?\n  if \(!userId\) return NextResponse\.json\(\{ error: 'User ID not resolved' \}, \{ status: 500 \}\);/;

// Type B2: no blank line
const typeB2Pattern = /  let userId: string \| undefined;\r?\n  const ingestSecret = request\.headers\.get\('x-ingest-secret'\);\r?\n  if \(ingestSecret\) \{\r?\n    if \(ingestSecret !== process\.env\.INGEST_API_KEY\) \{\r?\n      return NextResponse\.json\(\{ error: 'Invalid ingest secret' \}, \{ status: 401 \}\);\r?\n    \}\r?\n    userId = process\.env\.INGEST_USER_ID;\r?\n  \} else \{\r?\n    const session = await getServerSession\(getAuthOptions\(\)\);\r?\n    if \(!session\?\.user\?\.id\) \{\r?\n      return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\);\r?\n    \}\r?\n    userId = process\.env\.INGEST_USER_ID \?\? session\.user\.id;\r?\n  \}\r?\n  if \(!userId\) return NextResponse\.json\(\{ error: 'User ID not resolved' \}, \{ status: 500 \}\);/;

// Type C: briefing/latest variant (has INGEST_USER_ID check inside if block)
const typeCPattern = /  let userId: string \| undefined;\r?\n  const ingestSecret = \(request as any\)\.headers\?\.get\r?\n    \? \(request as any\)\.headers\.get\('x-ingest-secret'\)\r?\n    : null;\r?\n  if \(ingestSecret\) \{\r?\n    if \(ingestSecret !== process\.env\.INGEST_API_KEY\) \{\r?\n      return NextResponse\.json\(\{ error: 'Invalid ingest secret' \}, \{ status: 401 \}\);\r?\n    \}\r?\n    userId = process\.env\.INGEST_USER_ID;\r?\n    if \(!userId\) \{\r?\n      return NextResponse\.json\(\{ error: 'INGEST_USER_ID not configured' \}, \{ status: 500 \}\);\r?\n    \}\r?\n  \} else \{\r?\n    const session = await getServerSession\(getAuthOptions\(\)\);\r?\n    if \(!session\?\.user\?\.id\) \{\r?\n      return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\);\r?\n    \}\r?\n    userId = process\.env\.INGEST_USER_ID \?\? session\.user\.id;\r?\n  \}/;

function hybridFix(src) {
  src = removeAuthImports(src);
  src = addResolveUserImport(src);
  src = src.replace(typeAPattern, RESOLVE_USER);
  src = src.replace(typeBPattern, RESOLVE_USER);
  src = src.replace(typeB2Pattern, RESOLVE_USER);
  src = src.replace(typeCPattern, RESOLVE_USER);
  return src;
}

fix('app/api/conviction/latest/route.ts', hybridFix);
fix('app/api/graph/stats/route.ts', hybridFix);
fix('app/api/conviction/generate/route.ts', hybridFix);
fix('app/api/conviction/outcome/route.ts', hybridFix);
fix('app/api/drafts/pending/route.ts', hybridFix);
fix('app/api/drafts/propose/route.ts', hybridFix);
fix('app/api/briefing/latest/route.ts', hybridFix);
fix('app/api/drafts/decide/route.ts', hybridFix);

// ─── Cron auth with INGEST_USER_ID (resolveCronUser) ─────────────────────────

// sync-email + scan-social pattern: authHeader variable + cronSecret variable
const cronUserA = /  const authHeader = request\.headers\.get\('authorization'\) \?\? '';\r?\n  const cronSecret = process\.env\.CRON_SECRET;\r?\n  if \(!cronSecret \|\| authHeader !== `Bearer \$\{cronSecret\}`\) \{\r?\n    return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\);\r?\n  \}\r?\n\r?\n  const userId = process\.env\.INGEST_USER_ID;\r?\n  if \(!userId\) \{\r?\n    return NextResponse\.json\(\{ error: 'INGEST_USER_ID not configured' \}, \{ status: 500 \}\);\r?\n  \}/;

// outreach-learner pattern: no cronSecret variable, uses !process.env.CRON_SECRET
const cronUserB = /  const authHeader = request\.headers\.get\('authorization'\);\r?\n  if \(!process\.env\.CRON_SECRET \|\| authHeader !== `Bearer \$\{process\.env\.CRON_SECRET\}`\) \{\r?\n    return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\);\r?\n  \}\r?\n\r?\n  const userId = process\.env\.INGEST_USER_ID;\r?\n  if \(!userId\) \{\r?\n    return NextResponse\.json\(\{ error: 'INGEST_USER_ID not set' \}, \{ status: 500 \}\);\r?\n  \}/;

// scan-opportunities: isAuthorized helper + separate userId check
const scanOpAuthFn = /\/\/ Auth\r?\n\/\/ ---------------------------------------------------------------------------\r?\n\r?\nfunction isAuthorized\(request: Request\): boolean \{\r?\n  const auth = request\.headers\.get\('authorization'\) \?\? '';\r?\n  return auth === `Bearer \$\{process\.env\.CRON_SECRET\}`;\r?\n\}\r?\n/;
const scanOpAuthCall = /  if \(!isAuthorized\(request\)\) \{\r?\n    return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\);\r?\n  \}\r?\n\r?\n  const supabase = createServerClient\(\);\r?\n  const userId = process\.env\.INGEST_USER_ID;\r?\n  if \(!userId\) \{\r?\n    return NextResponse\.json\(\{ error: 'INGEST_USER_ID not set' \}, \{ status: 500 \}\);\r?\n  \}/;

const scanOpReplacement = `  const auth = resolveCronUser(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  const supabase = createServerClient();`;

function cronUserFix(src) {
  src = addResolveCronImport(src);
  src = src.replace(cronUserA, RESOLVE_CRON);
  src = src.replace(cronUserB, RESOLVE_CRON);
  return src;
}

fix('app/api/cron/sync-email/route.ts', cronUserFix);
fix('app/api/cron/scan-social/route.ts', cronUserFix);
fix('app/api/cron/agents/outreach-learner/route.ts', cronUserFix);

// scan-opportunities: special case (removes helper function + inline check)
fix('app/api/cron/scan-opportunities/route.ts', src => {
  src = addResolveCronImport(src);
  src = src.replace(scanOpAuthFn, '');
  src = src.replace(scanOpAuthCall, scanOpReplacement);
  return src;
});

// ─── daily-brief: validateCronAuth (no userId) ───────────────────────────────

// daily-brief handler auth: no CRON_SECRET variable
const dailyBriefAuth = /  const auth = request\.headers\.get\('authorization'\);\r?\n  if \(!process\.env\.CRON_SECRET \|\| auth !== `Bearer \$\{process\.env\.CRON_SECRET\}`\) \{\r?\n    return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\);\r?\n  \}/;

fix('app/api/cron/daily-brief/route.ts', src => {
  if (!src.includes("from '@/lib/auth/resolve-user'")) {
    src = src.replace(/^(import .+\r?\n)/m, `$1import { validateCronAuth } from '@/lib/auth/resolve-user';\n`);
  }
  src = src.replace(dailyBriefAuth,
    `  const authErr = validateCronAuth(request);\n  if (authErr) return authErr;`
  );
  return src;
});

// ─── Cleanup routes (validateCronAuth, param is req not request) ─────────────

const cleanupAuth = /  const authHeader = req\.headers\.get\('authorization'\);\r?\n  if \(authHeader !== `Bearer \$\{process\.env\.CRON_SECRET\}`\) \{\r?\n    return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\);\r?\n  \}/;

const validateCronBlock = `  const authErr = validateCronAuth(req as Request);
  if (authErr) return authErr;`;

function cleanupFix(src) {
  if (!src.includes("from '@/lib/auth/resolve-user'")) {
    src = src.replace(/^(import .+\r?\n)/m, `$1import { validateCronAuth } from '@/lib/auth/resolve-user';\n`);
  }
  src = src.replace(cleanupAuth, validateCronBlock);
  return src;
}

fix('app/api/cron/cleanup-cancelled/route.ts', cleanupFix);
fix('app/api/cron/cleanup-trials/route.ts', cleanupFix);

console.log('All done');
