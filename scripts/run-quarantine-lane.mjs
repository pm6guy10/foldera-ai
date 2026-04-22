#!/usr/bin/env node
/**
 * Quarantine lane runner.
 *
 * If no test in the CI bucket has the `@quarantine` tag, Playwright errors with
 * "No tests found" and exits 1 — which would fail the job even when the "none
 * quarantined" state is desirable.
 *
 * This wrapper greps the CI spec files for `@quarantine`; if none exist, it
 * prints a notice and exits 0. Otherwise it delegates to Playwright with the
 * quarantine lane env var.
 *
 * Keep this script tiny: the goal is correct exit codes, not clever logic.
 */

import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { spawnSync } from "node:child_process";

const SPEC_GLOBS = [
  "tests/e2e/public-routes.spec.ts",
  "tests/e2e/authenticated-routes.spec.ts",
  "tests/e2e/flow-routes.spec.ts",
];

let hasQuarantined = false;
for (const spec of SPEC_GLOBS) {
  let src;
  try {
    src = readFileSync(spec, "utf8");
  } catch {
    continue;
  }
  if (/@quarantine/.test(src)) {
    hasQuarantined = true;
    break;
  }
}

if (!hasQuarantined) {
  console.log(
    "quarantine-lane: no @quarantine-tagged tests found — nothing to report. (0 quarantined is the desired steady state.)",
  );
  process.exit(0);
}

const result = spawnSync(
  "npx",
  ["playwright", "test", "--config", "playwright.ci.config.ts"],
  {
    stdio: "inherit",
    env: { ...process.env, E2E_LANE: "quarantine" },
    shell: process.platform === "win32",
  },
);

process.exit(result.status ?? 1);
