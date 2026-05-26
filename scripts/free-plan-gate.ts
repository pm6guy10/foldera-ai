import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_SELECT_PATTERN =
  /\.select\(\s*(['"])([\s\S]*?)\1/gi;

const ALLOWED_PATH_PATTERNS = [
  `lib${sep}auth${sep}`,
  `lib${sep}sync${sep}`,
  `app${sep}api${sep}google${sep}`,
  `app${sep}api${sep}microsoft${sep}`,
];

export interface ForbiddenTokenSelect {
  file: string;
  line: number;
  excerpt: string;
}

function isAllowedPath(filePath: string): boolean {
  const normalized = filePath.split('/').join(sep);
  return ALLOWED_PATH_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function walkFiles(root: string, dir: string, output: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next' || entry === 'output' || entry === '.git') {
        continue;
      }
      walkFiles(root, full, output);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(entry)) continue;
    if (/(\.test|\.spec)\.(ts|tsx|js|mjs|cjs)$/.test(entry) || normalizedPathLooksTest(full)) {
      continue;
    }
    output.push(relative(root, full));
  }
  return output;
}

function normalizedPathLooksTest(filePath: string): boolean {
  const normalized = filePath.split('/').join(sep);
  return normalized.includes(`${sep}__tests__${sep}`) || normalized.includes(`${sep}tests${sep}`);
}

export function findForbiddenTokenSelects(repoRoot = process.cwd()): ForbiddenTokenSelect[] {
  const hits: ForbiddenTokenSelect[] = [];
  for (const file of walkFiles(repoRoot, repoRoot)) {
    if (isAllowedPath(file)) continue;
    const text = readFileSync(resolve(repoRoot, file), 'utf8');
    for (const match of text.matchAll(TOKEN_SELECT_PATTERN)) {
      const selectedColumns = match[2] ?? '';
      if (!/\b(access_token|refresh_token)\b/i.test(selectedColumns)) continue;
      const matchIndex = match.index ?? 0;
      const line = text.slice(0, matchIndex).split(/\r?\n/).length;
      const excerpt = text
        .slice(matchIndex, Math.min(matchIndex + 240, text.length))
        .split(/\r?\n/)
        .join(' ')
        .trim();
      hits.push({
        file,
        line,
        excerpt,
      });
    }
  }
  return hits;
}

export function formatFreePlanGateReport(hits: ForbiddenTokenSelect[]): string {
  if (hits.length === 0) {
    return 'FREE_PLAN_GATE: PASS\nNo forbidden token-value selects found outside auth/sync paths.';
  }

  const lines = [
    'FREE_PLAN_GATE: FAIL',
    'Forbidden token-value selects found outside auth/sync paths:',
    ...hits.map((hit) => `- ${hit.file}:${hit.line} ${hit.excerpt}`),
  ];
  return lines.join('\n');
}

async function main() {
  const repoRoot = process.cwd();
  const hits = findForbiddenTokenSelects(repoRoot);
  console.log(formatFreePlanGateReport(hits));
  process.exit(hits.length > 0 ? 1 : 0);
}

const isDirectRun =
  process.argv[1] != null && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(`[free-plan-gate] fatal: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
