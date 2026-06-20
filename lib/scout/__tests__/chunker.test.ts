import { describe, expect, it } from 'vitest';
import { chunkText, DEFAULT_CHUNK_CHARS } from '../chunker';

describe('chunkText', () => {
  it('returns [] for empty or whitespace input', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n  ')).toEqual([]);
  });

  it('returns a single trimmed chunk for short text', () => {
    expect(chunkText('  hello world  ')).toEqual(['hello world']);
  });

  it('keeps every chunk within maxChars', () => {
    const paragraph = 'lorem ipsum dolor sit amet '.repeat(40); // ~1080 chars
    const text = Array.from({ length: 12 }, () => paragraph.trim()).join('\n\n');
    const chunks = chunkText(text, { maxChars: 2000, overlapChars: 200 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
      expect(chunk.trim()).toBe(chunk);
    }
  });

  it('overlaps consecutive chunks so boundary context is shared', () => {
    const paras = Array.from({ length: 8 }, (_, i) => `PARA${i} ` + 'x'.repeat(300));
    const chunks = chunkText(paras.join('\n\n'), { maxChars: 700, overlapChars: 120 });
    expect(chunks.length).toBeGreaterThan(1);
    // The tail of chunk N should appear at the head of chunk N+1.
    const tail = chunks[0].slice(-50);
    expect(chunks[1].includes(tail.slice(0, 20))).toBe(true);
  });

  it('hard-slices a single oversized paragraph', () => {
    const huge = 'A'.repeat(10_000);
    const chunks = chunkText(huge, { maxChars: 3000, overlapChars: 300 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(3000);
    // Reassembled (de-overlapped) content covers the whole input.
    expect(chunks.join('').length).toBeGreaterThanOrEqual(10_000);
  });

  it('uses sane defaults (~800-token chunks)', () => {
    expect(DEFAULT_CHUNK_CHARS).toBe(3200);
    const text = 'word '.repeat(2000); // ~10000 chars, single paragraph
    const chunks = chunkText(text);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(DEFAULT_CHUNK_CHARS);
  });
});
