import { describe, expect, it } from 'vitest';
import { buildReviewSendModal } from '../right-now';
import type { WorkdayPresenceDraft } from '@/lib/workday-presence/model';

type Block = { type: string; elements?: Array<{ text?: string }> };

function contextTexts(view: ReturnType<typeof buildReviewSendModal>): string[] {
  const blocks = (view.blocks as Block[]) ?? [];
  return blocks
    .filter((b) => b.type === 'context')
    .flatMap((b) => (b.elements ?? []).map((e) => e.text ?? ''));
}

const draftBase: WorkdayPresenceDraft = {
  action_type: 'send_message',
  title: 'Q3 budget + forecast',
  preview: 'attached is the updated Q3 budget',
  to: 'dana@example.com',
  body: 'Dana — attached is the budget and forecast.',
  action_id: 'action-1',
};

describe('buildReviewSendModal attachment surface', () => {
  it('lists the attachments in a context block when present', () => {
    const view = buildReviewSendModal({
      draft: {
        ...draftBase,
        attachments: [
          { filename: 'Q3-Budget.md', mime_type: 'text/markdown', content: '# Q3' },
          { filename: 'Forecast.csv', mime_type: 'text/csv', content: 'a,b' },
        ],
      },
      sourceLine: null,
      metadata: { action_id: 'action-1' },
    });
    const texts = contextTexts(view).join('\n');
    expect(texts).toContain('Attaching 2 files');
    expect(texts).toContain('Q3-Budget.md, Forecast.csv');
  });

  it('uses the singular form for one attachment', () => {
    const view = buildReviewSendModal({
      draft: {
        ...draftBase,
        attachments: [{ filename: 'Q3-Budget.md', mime_type: 'text/markdown', content: '# Q3' }],
      },
      sourceLine: null,
      metadata: { action_id: 'action-1' },
    });
    expect(contextTexts(view).join('\n')).toContain('Attaching 1 file:');
  });

  it('shows no attachment context block when there are none', () => {
    const view = buildReviewSendModal({ draft: draftBase, sourceLine: null, metadata: { action_id: 'action-1' } });
    expect(contextTexts(view).join('\n')).not.toContain('Attaching');
  });
});
