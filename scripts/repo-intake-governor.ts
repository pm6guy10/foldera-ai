import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildIntakePacket, formatIntakePacket } from '@/lib/repo-intake-governor';

function getArgValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? null;
}

export function runRepoIntakeGovernorCli(args = process.argv.slice(2)): string {
  const inputPath = getArgValue(args, '--input');
  if (!inputPath) {
    throw new Error('Usage: npm run governor:intake -- --input <markdown-or-text-file>');
  }

  const input = readFileSync(inputPath, 'utf8');
  const packet = buildIntakePacket(input);
  return formatIntakePacket(packet);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    console.log(runRepoIntakeGovernorCli());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
