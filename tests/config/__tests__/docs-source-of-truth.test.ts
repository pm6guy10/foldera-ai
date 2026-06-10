import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_ROOT_MARKDOWN_FILES, ROOT_KEEP_MARKDOWN } from '@/scripts/continuity-gate';

function readDoc(file: string): string {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf8');
}

describe('documentation source-of-truth boundaries (Governance Collapse v1, issue #240)', () => {
  it('keeps the root markdown surface bounded to the keep-list', () => {
    const rootMarkdown = fs.readdirSync(process.cwd()).filter((name) => name.toLowerCase().endsWith('.md'));
    expect(rootMarkdown.length).toBeLessThanOrEqual(MAX_ROOT_MARKDOWN_FILES);
    for (const file of ROOT_KEEP_MARKDOWN) {
      expect(rootMarkdown).toContain(file);
    }
  });

  it('keeps ACTIVE_HANDOFF.md as the single command cockpit', () => {
    const activeHandoff = readDoc('ACTIVE_HANDOFF.md');
    expect(activeHandoff).toContain('# ACTIVE HANDOFF');
    expect(activeHandoff).toMatch(/Current slice:?/);
    expect(activeHandoff).toContain('## Next exact move');
    expect(activeHandoff).toContain('GitHub writeback before stop is mandatory.');
    expect(activeHandoff.split(/\r?\n/).length).toBeLessThanOrEqual(80);
  });

  it('keeps AGENTS.md as the single agent execution contract', () => {
    const agents = readDoc('AGENTS.md');
    expect(agents).toContain('One active seam only');
    expect(agents).toContain('source-truth closeout');
    expect(agents).toContain('GitHub source truth beats chat memory');
    expect(agents).toContain('A new governance rule may only be added by editing an existing keep-list file');
  });

  it('keeps CLAUDE.md and .cursorrules as thin pointers to AGENTS.md', () => {
    for (const pointer of ['CLAUDE.md', '.cursorrules']) {
      const body = readDoc(pointer);
      expect(body).toContain('AGENTS.md');
      expect(body.split(/\r?\n/).length).toBeLessThanOrEqual(40);
    }
  });

  it('keeps the build order machine-readable', () => {
    const buildOrder = readDoc('FOLDERA_BUILD_ORDER.yaml');
    expect(buildOrder).toContain('writeback_required: true');
    expect(buildOrder).toMatch(/^active_issue:\s*\S+/m);
    expect(buildOrder).toContain('accepted_terminal_states:');
  });
});
