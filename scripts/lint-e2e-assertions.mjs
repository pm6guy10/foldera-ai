#!/usr/bin/env node
/**
 * Static assertion linter for Playwright specs.
 *
 * Locks out bug classes that caused CI to fail 3 tests on 2026-04-22:
 *   CLASS A — raw-Markdown assertion against a ReactMarkdown-rendered container.
 *             Example: `documentBody.toContainText('## Situation')` where documentBody
 *             is `getByTestId('dashboard-document-body')` and the dashboard pipes body
 *             through ReactMarkdown, so `##` is stripped from the DOM.
 *   CLASS B — `test.only` / `describe.only` shipped to CI (silently skips sibling tests).
 *
 * This script is intentionally tiny and dependency-free so it can run in:
 *   - the pre-push hook (sub-second)
 *   - the CI workflow as a pre-Playwright gate
 *
 * Extend this file — do not delete it — if new structural bug classes emerge.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const TEST_DIRS = ["tests/e2e"];

/**
 * Containers whose text nodes are produced by ReactMarkdown / a markdown-to-HTML pipeline.
 * Any Playwright assertion that targets one of these testids must NOT expect raw
 * markdown syntax (`##`, `**`, `_`, etc.) in the DOM.
 */
const MARKDOWN_RENDERED_TESTIDS = ["dashboard-document-body"];

/** Raw markdown fragments that would never appear in the rendered DOM. */
const RAW_MARKDOWN_PATTERNS = [
  /['"`]\s*#{1,6}\s+[^'"`]+['"`]/, // `'## Situation'`, `"### Next"`, etc.
  /['"`]\*\*[^'"`]+\*\*['"`]/, // `'**bold**'`
];

const failures = [];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) files.push(...walk(full));
    else if (/\.spec\.(ts|tsx|js|mjs)$/.test(entry)) files.push(full);
  }
  return files;
}

/**
 * CLASS A check — flag Playwright assertions that chain off a locator bound to a
 * markdown-rendered testid and pass a raw-markdown literal.
 *
 * We implement this per-file by:
 *   1. Finding variable names assigned via `getByTestId('dashboard-document-body')`.
 *   2. Scanning for `<var>).toContainText(...)` / `.toHaveText(...)` calls that include
 *      a raw-markdown literal.
 */
function checkRawMarkdownAssertions(file, src) {
  const varRegex = new RegExp(
    `(?:const|let|var)\\s+(\\w+)\\s*=\\s*[^;]*?getByTestId\\(\\s*['"\`](?:${MARKDOWN_RENDERED_TESTIDS.join(
      "|",
    )})['"\`]\\s*\\)`,
    "g",
  );
  const markdownVars = new Set();
  let m;
  while ((m = varRegex.exec(src)) !== null) markdownVars.add(m[1]);
  if (markdownVars.size === 0) return;

  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const v of markdownVars) {
      if (!line.includes(v)) continue;
      if (!/\.(toContainText|toHaveText|toMatch|toHaveTextContent)\s*\(/.test(line))
        continue;
      if (RAW_MARKDOWN_PATTERNS.some((re) => re.test(line))) {
        failures.push({
          file,
          line: i + 1,
          kind: "raw-markdown-assertion",
          snippet: line.trim(),
          hint:
            "Container is rendered via ReactMarkdown. Assert on getByRole('heading', { name: 'Situation' }) or the rendered body text — never on '## ' raw syntax.",
        });
      }
    }
  }
}

function checkFocusedOnly(file, src) {
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(test|it|describe)\.only\s*\(/.test(line)) {
      failures.push({
        file,
        line: i + 1,
        kind: "focused-test",
        snippet: line.trim(),
        hint: "Remove .only before pushing — it silently skips every sibling test in CI.",
      });
    }
  }
}

for (const dir of TEST_DIRS) {
  let files;
  try {
    files = walk(join(ROOT, dir));
  } catch {
    continue;
  }
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    checkRawMarkdownAssertions(file, src);
    checkFocusedOnly(file, src);
  }
}

if (failures.length === 0) {
  console.log("lint-e2e-assertions: OK");
  process.exit(0);
}

for (const f of failures) {
  const rel = relative(ROOT, f.file).split(sep).join("/");
  console.error(`\n[${f.kind}] ${rel}:${f.line}\n  ${f.snippet}\n  -> ${f.hint}`);
}
console.error(`\nlint-e2e-assertions: ${failures.length} violation(s).`);
process.exit(1);
