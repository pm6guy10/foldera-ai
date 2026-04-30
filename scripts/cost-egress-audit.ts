import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type Finding = {
  file: string;
  message: string;
};

const ROOT = process.cwd();
const TARGET_TABLES = ['tkg_actions', 'tkg_signals', 'tkg_entities'];
const RAW_SIGNAL_CONTENT_ALLOWED = new Set([
  'lib/signals/signal-processor.ts',
]);

function gitFiles(patterns: string[]): string[] {
  return execFileSync('git', ['ls-files', ...patterns], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => fs.existsSync(path.join(ROOT, file)));
}

function read(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function lineNumber(source: string, index: number): number {
  return source.slice(0, index).split(/\r?\n/).length;
}

function addFinding(findings: Finding[], file: string, message: string): void {
  findings.push({ file, message });
}

function collectQueryChain(source: string, fromIndex: number): string {
  const before = source.slice(0, fromIndex);
  const fromLine = before.split(/\r?\n/).length - 1;
  const lines = source.split(/\r?\n/);
  const chain: string[] = [];

  for (let offset = 0; offset < 24 && fromLine + offset < lines.length; offset += 1) {
    const line = lines[fromLine + offset];
    if (offset > 0 && line.trim() === '') {
      break;
    }
    chain.push(line);
    if (offset > 0 && /\.(?:limit|range|single|maybeSingle)\s*\(/.test(line)) {
      break;
    }
  }

  return chain.join('\n');
}

function auditApiRoutes(findings: Finding[]): void {
  const files = gitFiles(['app/api/**/*.ts', 'app/api/**/*.tsx'])
    .filter((file) => !file.includes('/__tests__/') && !file.includes('\\__tests__\\'));

  for (const file of files) {
    const source = read(file);
    const selectStar = /\.select\s*\(\s*(['"`])\s*\*\s*\1\s*\)/g;
    let star: RegExpExecArray | null;
    while ((star = selectStar.exec(source))) {
      addFinding(findings, file, `line ${lineNumber(source, star.index)} uses select('*')`);
    }

    for (const table of TARGET_TABLES) {
      const tablePattern = new RegExp(String.raw`\.from\s*\(\s*['"\`]${table}['"\`]\s*\)`, 'g');
      let match: RegExpExecArray | null;
      while ((match = tablePattern.exec(source))) {
        const chain = collectQueryChain(source, match.index);
        if (!/\.select\s*\(/.test(chain)) {
          continue;
        }

        const bounded =
          /\.limit\s*\(/.test(chain) ||
          /\.range\s*\(/.test(chain) ||
          /\.single\s*\(/.test(chain) ||
          /\.maybeSingle\s*\(/.test(chain) ||
          /head\s*:\s*true/.test(chain);

        if (!bounded) {
          addFinding(
            findings,
            file,
            `line ${lineNumber(source, match.index)} reads ${table} without limit/range/single/head bound`,
          );
        }
      }
    }
  }
}

function auditLatestRoute(findings: Finding[]): void {
  const file = 'app/api/conviction/latest/route.ts';
  const source = read(file);
  const rankingLimit = source.match(/PENDING_RANKING_LIMIT\s*=\s*(\d+)/);
  if (!rankingLimit || Number(rankingLimit[1]) > 5) {
    addFinding(findings, file, 'pending metadata query must be limited to 5 rows or fewer');
  }

  if (!/PENDING_RANKING_SELECT\s*=\s*'id, confidence, generated_at, status'/.test(source)) {
    addFinding(findings, file, 'pending metadata query must stay on the small ranking column set');
  }

  const heavyPayloadSelect = source.indexOf('PENDING_PAYLOAD_SELECT');
  const selectedIdFilter = source.indexOf(".eq('id', selectedCandidate.id)");
  if (heavyPayloadSelect === -1 || selectedIdFilter === -1 || selectedIdFilter < heavyPayloadSelect) {
    addFinding(findings, file, 'full evidence/execution_result/artifact payload must be fetched only for selected action id');
  }
}

function auditProductionScripts(findings: Finding[]): void {
  const files = gitFiles(['scripts/**/*.ts', 'scripts/**/*.js', 'scripts/**/*.mjs', 'scripts/**/*.sh']);
  for (const file of files) {
    const source = read(file);
    if (/https:\/\/(?:www\.)?foldera\.ai\b/i.test(source) && !/ALLOW_PROD_PROOF/.test(source)) {
      addFinding(findings, file, 'hits foldera.ai without an ALLOW_PROD_PROOF gate');
    }
  }
}

function auditSignalContextReads(findings: Finding[]): void {
  const files = gitFiles(['app/api/**/*.ts', 'lib/**/*.ts'])
    .filter((file) => !file.includes('/__tests__/') && !file.includes('\\__tests__\\'));

  for (const file of files) {
    const source = read(file);
    const tablePattern = /\.from\s*\(\s*['"`]tkg_signals['"`]\s*\)/g;
    let match: RegExpExecArray | null;
    while ((match = tablePattern.exec(source))) {
      const chain = collectQueryChain(source, match.index);
      if (!/\.select\s*\(/.test(chain)) continue;

      const fetchesRawContent = /\.select\s*\([^)]*\bcontent\b/.test(chain);
      const idScoped = /\.(?:eq|in)\s*\(\s*['"`]id['"`]/.test(chain);
      if (fetchesRawContent && !idScoped && !RAW_SIGNAL_CONTENT_ALLOWED.has(file)) {
        addFinding(
          findings,
          file,
          `line ${lineNumber(source, match.index)} fetches tkg_signals.content outside a selected signal id path`,
        );
      }

      const numericLimit = chain.match(/\.limit\s*\(\s*(\d+)\s*\)/);
      if (numericLimit && Number(numericLimit[1]) > 150 && !idScoped && !RAW_SIGNAL_CONTENT_ALLOWED.has(file)) {
        addFinding(
          findings,
          file,
          `line ${lineNumber(source, match.index)} reads more than 150 tkg_signals rows`,
        );
      }
    }
  }
}

function main(): void {
  const findings: Finding[] = [];
  auditApiRoutes(findings);
  auditLatestRoute(findings);
  auditSignalContextReads(findings);
  auditProductionScripts(findings);

  if (findings.length > 0) {
    console.error('[cost:egress-audit] failed');
    for (const finding of findings) {
      console.error(`- ${finding.file}: ${finding.message}`);
    }
    process.exit(1);
  }

  console.log('[cost:egress-audit] passed');
}

main();
