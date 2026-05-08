#!/usr/bin/env node

import { access, readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const ROOT = process.cwd();
const NEXT_DIR = path.join(ROOT, '.next');
const TIMEOUT_MS = Number(process.env.NEXT_BUILD_SETTLE_TIMEOUT_MS ?? 30000);
const POLL_MS = 500;
const execFileAsync = promisify(execFile);
const REQUIRED_SERVER_FILES = [
  path.join(NEXT_DIR, 'BUILD_ID'),
  path.join(NEXT_DIR, 'server', 'app', 'start', 'page.js'),
  path.join(NEXT_DIR, 'server', 'app', 'login', 'page.js'),
  path.join(NEXT_DIR, 'server', 'app', 'dashboard', 'page.js'),
  path.join(NEXT_DIR, 'server', 'pages', '_error.js'),
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readBuildId() {
  try {
    return (await readFile(path.join(NEXT_DIR, 'BUILD_ID'), 'utf8')).trim();
  } catch {
    return '';
  }
}

async function requiredFiles() {
  const buildId = await readBuildId();
  const files = [...REQUIRED_SERVER_FILES];
  if (buildId) {
    files.push(
      path.join(NEXT_DIR, 'static', buildId, '_buildManifest.js'),
      path.join(NEXT_DIR, 'static', buildId, '_ssgManifest.js'),
    );
  }
  return files;
}

async function snapshot(files) {
  const entries = [];
  for (const filePath of files) {
    if (!(await exists(filePath))) {
      return { ready: false, missing: filePath, signature: '' };
    }
    const info = await stat(filePath);
    entries.push(`${filePath}:${info.size}:${Math.trunc(info.mtimeMs)}`);
  }
  return { ready: true, missing: '', signature: entries.join('|') };
}

async function hasActiveWindowsBuildProcess() {
  if (process.platform !== 'win32') return false;

  const command = `
$processes = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -eq 'node.exe' -and $_.CommandLine -and (
    $_.CommandLine -like '*npm-cli.js* run build*' -or
    $_.CommandLine -like '*node_modules*next*dist*bin*next* build*' -or
    $_.CommandLine -like '*next*dist*compiled*jest-worker*processChild.js*'
  )
}
($processes | Measure-Object).Count
`;

  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      command,
    ]);
    return Number(stdout.trim()) > 0;
  } catch {
    return false;
  }
}

const started = Date.now();
let lastSignature = '';
let stableCount = 0;

while (Date.now() - started < TIMEOUT_MS) {
  const files = await requiredFiles();
  const current = await snapshot(files);
  const buildProcessActive = await hasActiveWindowsBuildProcess();
  if (current.ready) {
    if (!buildProcessActive && current.signature === lastSignature) {
      stableCount += 1;
    } else if (!buildProcessActive) {
      stableCount = 1;
      lastSignature = current.signature;
    } else {
      stableCount = 0;
    }

    if (stableCount >= 3) {
      console.log('Next build output settled.');
      process.exit(0);
    }
  } else {
    stableCount = 0;
    lastSignature = '';
  }

  await sleep(POLL_MS);
}

const files = await requiredFiles();
const current = await snapshot(files);
console.error(
  current.ready
    ? 'Next build output did not settle before timeout.'
    : `Next build output is missing ${path.relative(ROOT, current.missing)}.`,
);
process.exit(1);
