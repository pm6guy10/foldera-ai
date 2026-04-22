/**
 * Minimal markdown -> inline-styled HTML converter for email clients.
 *
 * Why a hand-rolled converter: email clients strip <style>/<link> and ignore most
 * class-based styling. Every tag needs an inline style attribute. Existing libs
 * (marked/remark) produce class-styled output that renders as plain text in Gmail.
 *
 * Supports the subset write_document artifacts actually produce:
 *   - #, ##, ### headers
 *   - paragraphs with blank-line separation
 *   - bullet lists ( -, *, + ) and numbered lists ( 1. )
 *   - **bold**, *italic*, `code`, [text](url)
 *   - blockquotes ( > ), horizontal rules ( --- )
 *   - preserves line breaks within paragraphs
 */

const DEFAULT_FONT = 'Inter,system-ui,-apple-system,BlinkMacSystemFont,sans-serif';
const MONO_FONT = 'ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    '<a href="$2" style="color:#22d3ee;text-decoration:underline;">$1</a>',
  );
  out = out.replace(
    /\*\*([^*\n]+?)\*\*/g,
    '<strong style="color:#ffffff;font-weight:700;">$1</strong>',
  );
  out = out.replace(
    /__([^_\n]+?)__/g,
    '<strong style="color:#ffffff;font-weight:700;">$1</strong>',
  );
  out = out.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^_\w])_([^_\n]+?)_(?!_)/g, '$1<em>$2</em>');
  out = out.replace(
    /`([^`\n]+?)`/g,
    `<code style="font-family:${MONO_FONT};background:rgba(255,255,255,0.08);padding:1px 6px;border-radius:4px;font-size:0.92em;">$1</code>`,
  );
  return out;
}

export function markdownToEmailHtml(
  md: string,
  opts?: { font?: string; color?: string },
): string {
  const font = opts?.font ?? DEFAULT_FONT;
  const color = opts?.color ?? '#e4e4e7';
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let paraLines: string[] = [];

  const flushParagraph = () => {
    if (paraLines.length === 0) return;
    const inner = paraLines.map((l) => renderInline(l)).join('<br />');
    out.push(
      `<p style="margin:0 0 12px 0;font-family:${font};font-size:14px;color:${color};line-height:1.65;">${inner}</p>`,
    );
    paraLines = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      flushParagraph();
      i++;
      continue;
    }

    const header = /^(#{1,3})\s+(.*)$/.exec(line);
    if (header) {
      flushParagraph();
      const level = header[1].length;
      const text = renderInline(header[2].trim());
      const size = level === 1 ? '20px' : level === 2 ? '16px' : '14px';
      const weight = level === 1 ? '800' : '700';
      const margin = level === 1 ? '24px 0 12px 0' : '18px 0 8px 0';
      const letter = level === 3 ? 'letter-spacing:0.04em;' : '';
      out.push(
        `<p style="margin:${margin};font-family:${font};font-size:${size};font-weight:${weight};color:#ffffff;line-height:1.35;${letter}">${text}</p>`,
      );
      i++;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        const m = /^\s*[-*+]\s+(.*)$/.exec(lines[i])!;
        items.push(
          `<li style="margin:0 0 6px 0;font-family:${font};font-size:14px;color:${color};line-height:1.65;">${renderInline(m[1])}</li>`,
        );
        i++;
      }
      out.push(
        `<ul style="margin:0 0 12px 0;padding-left:22px;">${items.join('')}</ul>`,
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      flushParagraph();
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const m = /^\s*\d+\.\s+(.*)$/.exec(lines[i])!;
        items.push(
          `<li style="margin:0 0 6px 0;font-family:${font};font-size:14px;color:${color};line-height:1.65;">${renderInline(m[1])}</li>`,
        );
        i++;
      }
      out.push(
        `<ol style="margin:0 0 12px 0;padding-left:22px;">${items.join('')}</ol>`,
      );
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushParagraph();
      const quoted: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(
        `<blockquote style="margin:0 0 12px 0;padding:8px 14px;border-left:3px solid #22d3ee;font-family:${font};font-size:14px;color:#a1a1aa;line-height:1.65;">${renderInline(quoted.join(' '))}</blockquote>`,
      );
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      flushParagraph();
      out.push(
        '<hr style="border:0;border-top:1px solid rgba(255,255,255,0.12);margin:16px 0;" />',
      );
      i++;
      continue;
    }

    paraLines.push(line);
    i++;
  }

  flushParagraph();
  return out.join('\n');
}
