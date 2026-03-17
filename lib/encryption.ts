/**
 * Application-layer AES-256-GCM encryption for sensitive fields (tkg_signals.content).
 *
 * Key: ENCRYPTION_KEY env var — 32-byte key, base64-encoded.
 * Wire format: base64( IV[12] || AuthTag[16] || Ciphertext[n] )
 *
 * decryptWithStatus() exposes whether decryption had to fall back to the raw
 * value so callers can skip malformed or legacy rows instead of treating the
 * fallback as safe plaintext.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM  = 'aes-256-gcm';
const IV_BYTES   = 12;   // 96-bit IV — required for GCM
const TAG_BYTES  = 16;   // 128-bit auth tag

export interface DecryptResult {
  plaintext: string;
  usedFallback: boolean;
}

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY env var is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes');
  return key;
}

/**
 * Encrypts a UTF-8 plaintext string.
 * Returns a base64 string: IV (12 B) + AuthTag (16 B) + Ciphertext.
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv  = randomBytes(IV_BYTES);

  const cipher    = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag       = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypts a string produced by encrypt().
 * Falls back to returning the raw value for pre-encryption legacy rows.
 */
export function decrypt(ciphertext: string): string {
  return decryptWithStatus(ciphertext).plaintext;
}

export function decryptWithStatus(ciphertext: string): DecryptResult {
  try {
    const key = getKey();
    const buf = Buffer.from(ciphertext, 'base64');

    // Too short to be a valid encrypted value — legacy plaintext row
    if (buf.length < IV_BYTES + TAG_BYTES + 1) {
      return { plaintext: ciphertext, usedFallback: true };
    }

    const iv        = buf.subarray(0, IV_BYTES);
    const tag       = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const encrypted = buf.subarray(IV_BYTES + TAG_BYTES);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    return {
      plaintext: Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8'),
      usedFallback: false,
    };
  } catch {
    // Decryption failed — return raw value (pre-encryption legacy row)
    return { plaintext: ciphertext, usedFallback: true };
  }
}
