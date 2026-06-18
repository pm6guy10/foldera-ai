import { describe, expect, it } from 'vitest';
import {
  attachmentByteLength,
  attachmentToBase64,
  buildRfc2822Message,
  describeAttachments,
  MAX_ATTACHMENTS,
  normalizeEmailAttachments,
  sanitizeAttachmentFilename,
  toGraphAttachments,
  toResendAttachments,
  type EmailAttachment,
} from '../attachments';

const textAttachment: EmailAttachment = {
  filename: 'Q3-Budget.md',
  mime_type: 'text/markdown',
  content: '# Q3 Budget\n\nHeadcount: 12\nBurn: $480k/mo',
};

describe('normalizeEmailAttachments', () => {
  it('keeps a valid text attachment', () => {
    const out = normalizeEmailAttachments([textAttachment]);
    expect(out).toHaveLength(1);
    expect(out[0].filename).toBe('Q3-Budget.md');
    expect(out[0].mime_type).toBe('text/markdown');
  });

  it('returns [] for non-array input', () => {
    expect(normalizeEmailAttachments(null)).toEqual([]);
    expect(normalizeEmailAttachments('nope')).toEqual([]);
    expect(normalizeEmailAttachments({})).toEqual([]);
  });

  it('drops entries missing a filename, mime type, or any content', () => {
    expect(
      normalizeEmailAttachments([
        { mime_type: 'text/plain', content: 'x' },
        { filename: 'a.txt', content: 'x' },
        { filename: 'b.txt', mime_type: 'text/plain' },
        { filename: 'c.txt', mime_type: 'text/plain', content: '   ' },
      ]),
    ).toEqual([]);
  });

  it('accepts camelCase mimeType / contentBase64 aliases', () => {
    const out = normalizeEmailAttachments([
      { filename: 'f.csv', mimeType: 'text/csv', contentBase64: Buffer.from('a,b').toString('base64') },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].mime_type).toBe('text/csv');
  });

  it('caps the attachment count', () => {
    const many = Array.from({ length: MAX_ATTACHMENTS + 3 }, (_, i) => ({
      filename: `f${i}.txt`,
      mime_type: 'text/plain',
      content: `content ${i}`,
    }));
    expect(normalizeEmailAttachments(many)).toHaveLength(MAX_ATTACHMENTS);
  });

  it('drops an oversized single attachment but keeps a small one', () => {
    const big = 'x'.repeat(6 * 1024 * 1024); // > 5 MB cap
    const out = normalizeEmailAttachments([
      { filename: 'huge.txt', mime_type: 'text/plain', content: big },
      textAttachment,
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].filename).toBe('Q3-Budget.md');
  });

  it('sanitizes header-breaking filenames', () => {
    const out = normalizeEmailAttachments([
      { filename: 'evil"\r\nBcc: x@y.com.txt', mime_type: 'text/plain', content: 'x' },
    ]);
    expect(out[0].filename).not.toContain('\r');
    expect(out[0].filename).not.toContain('\n');
    expect(out[0].filename).not.toContain('"');
  });
});

describe('attachment encoding helpers', () => {
  it('base64-encodes text content', () => {
    expect(attachmentToBase64(textAttachment)).toBe(
      Buffer.from(textAttachment.content!, 'utf8').toString('base64'),
    );
  });

  it('prefers content_base64 when present', () => {
    const b64 = Buffer.from('binary-bytes').toString('base64');
    expect(attachmentToBase64({ filename: 'x', mime_type: 'application/pdf', content_base64: b64 })).toBe(b64);
  });

  it('measures decoded byte length', () => {
    expect(attachmentByteLength({ filename: 'x', mime_type: 'text/plain', content: 'abc' })).toBe(3);
  });

  it('sanitizeAttachmentFilename falls back to a default when empty', () => {
    expect(sanitizeAttachmentFilename('   ')).toBe('attachment');
  });

  it('describeAttachments lists filenames', () => {
    expect(describeAttachments([textAttachment, { filename: 'f.csv', mime_type: 'text/csv', content: 'a' }])).toBe(
      'Q3-Budget.md, f.csv',
    );
  });
});

describe('buildRfc2822Message', () => {
  it('builds a single text/plain part when there are no attachments', () => {
    const msg = buildRfc2822Message({ to: 'a@b.com', subject: 'Hi', body: 'hello' });
    expect(msg).toContain('To: a@b.com');
    expect(msg).toContain('Subject: Hi');
    expect(msg).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(msg).not.toContain('multipart/mixed');
    expect(msg.endsWith('hello')).toBe(true);
  });

  it('includes reply headers when provided', () => {
    const msg = buildRfc2822Message({
      to: 'a@b.com',
      subject: 'Re: x',
      headers: [
        { name: 'In-Reply-To', value: '<abc@mail>' },
        { name: 'References', value: '<abc@mail>' },
      ],
      body: 'reply',
    });
    expect(msg).toContain('In-Reply-To: <abc@mail>');
    expect(msg).toContain('References: <abc@mail>');
  });

  it('builds a multipart/mixed message with the body first and each attachment', () => {
    const msg = buildRfc2822Message({
      to: 'a@b.com',
      subject: 'Budget',
      body: 'See attached.',
      attachments: [textAttachment, { filename: 'Forecast.csv', mime_type: 'text/csv', content: 'a,b\n1,2' }],
      boundary: 'BOUND',
    });
    expect(msg).toContain('Content-Type: multipart/mixed; boundary="BOUND"');
    expect(msg).toContain('--BOUND');
    expect(msg).toContain('See attached.');
    expect(msg).toContain('Content-Disposition: attachment; filename="Q3-Budget.md"');
    expect(msg).toContain('Content-Disposition: attachment; filename="Forecast.csv"');
    expect(msg).toContain('Content-Transfer-Encoding: base64');
    // base64 of the markdown content appears in the body part
    expect(msg).toContain(Buffer.from(textAttachment.content!, 'utf8').toString('base64').slice(0, 20));
    // closes with the terminal boundary
    expect(msg.trimEnd().endsWith('--BOUND--')).toBe(true);
  });
});

describe('provider mappers', () => {
  it('toGraphAttachments builds Graph fileAttachment objects', () => {
    const [graph] = toGraphAttachments([textAttachment]);
    expect(graph['@odata.type']).toBe('#microsoft.graph.fileAttachment');
    expect(graph.name).toBe('Q3-Budget.md');
    expect(graph.contentType).toBe('text/markdown');
    expect(graph.contentBytes).toBe(Buffer.from(textAttachment.content!, 'utf8').toString('base64'));
  });

  it('toResendAttachments builds { filename, content } base64 objects', () => {
    const [resend] = toResendAttachments([textAttachment]);
    expect(resend.filename).toBe('Q3-Budget.md');
    expect(resend.content).toBe(Buffer.from(textAttachment.content!, 'utf8').toString('base64'));
  });
});
