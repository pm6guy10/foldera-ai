const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { createRequire } = require('node:module');
const { dirname, join } = require('node:path');

function resolveLocalTsxCli(cwd = process.cwd()) {
  const requireFromCwd = createRequire(join(cwd, 'package.json'));
  const tsxPackageJsonPath = requireFromCwd.resolve('tsx/package.json');
  const cliPath = join(dirname(tsxPackageJsonPath), 'dist', 'cli.mjs');

  if (!existsSync(cliPath)) {
    throw new Error(`Local tsx CLI not found at ${cliPath}`);
  }

  return cliPath;
}

function runWithLocalTsx(args, cwd = process.cwd()) {
  const cliPath = resolveLocalTsxCli(cwd);
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

if (require.main === module) {
  try {
    runWithLocalTsx(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`run-local-tsx: ${message}`);
    process.exit(1);
  }
}

module.exports = {
  resolveLocalTsxCli,
  runWithLocalTsx,
};
