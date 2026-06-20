import { describe, expect, it } from 'vitest';
import { encrypt, decryptWithStatus, looksLikeEncryptedPayload } from '../encryption';

describe('encrypt/decryptWithStatus round-trip', () => {
  it('encrypts then decrypts back to the original plaintext', () => {
    const plain = 'From: a@b.com\nSubject: Hello\n\nThis is the body.';
    const out = decryptWithStatus(encrypt(plain));
    expect(out.usedFallback).toBe(false);
    expect(out.plaintext).toBe(plain);
  });

  it('returns usedFallback=true and the raw value for non-ciphertext (legacy plaintext)', () => {
    const plain = 'Hi Darlene, thanks for following up — here are my completed forms.';
    const out = decryptWithStatus(plain);
    expect(out.usedFallback).toBe(true);
    expect(out.plaintext).toBe(plain);
  });
});

describe('looksLikeEncryptedPayload (#481 FORMAT GAP discriminator)', () => {
  it('true for long, pure-base64 ciphertext that failed to decrypt', () => {
    // A real GCM blob shape: long + only base64 chars.
    const ciphertext = encrypt('x'.repeat(200));
    expect(looksLikeEncryptedPayload(ciphertext)).toBe(true);
  });

  it('false for readable plaintext (has spaces/punctuation/newlines)', () => {
    expect(looksLikeEncryptedPayload('Hi Darlene, here are my completed forms for the interview.')).toBe(false);
    expect(looksLikeEncryptedPayload('ESB Technician Interview Prep\n\nQ1: UI knowledge and fit...')).toBe(false);
  });

  it('false for empty / short / nullish input', () => {
    expect(looksLikeEncryptedPayload('')).toBe(false);
    expect(looksLikeEncryptedPayload(null)).toBe(false);
    expect(looksLikeEncryptedPayload(undefined)).toBe(false);
    expect(looksLikeEncryptedPayload('short')).toBe(false);
  });

  it('a plaintext uploaded document is KEPT, not treated as ciphertext (the bug class)', () => {
    const doc = 'RESUME\nBrandon Kapp\n\nProgram Operations | Medicaid, Public Sector\n'.repeat(20);
    const out = decryptWithStatus(doc);
    // decrypt falls back (not encrypted) but the content is readable plaintext...
    expect(out.usedFallback).toBe(true);
    // ...and the FORMAT-GAP guard must classify it as NOT ciphertext, so callers keep it.
    expect(looksLikeEncryptedPayload(doc)).toBe(false);
  });
});
