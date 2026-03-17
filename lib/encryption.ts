/**
 * Application-layer AES-256-GCM encryption for sensitive fields (tkg_signals.content).
 *
 * Key: ENCRYPTION_KEY env var — 32-byte key, base64-encoded by standard,
 * with hex decoding accepted for legacy/deployment compatibility.
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
const HEX_KEY_REGEX = /^[0-9a-f]{64}$/i;

export interface DecryptResult {
  plaintext: string;
  usedFallback: boolean;
}

function decodeKeyCandidates(raw: string, label: string): Buffer[] {
  const candidates: Buffer[] = [];
  const base64Key = Buffer.from(raw, 'base64');
  if (base64Key.length === 32) {
    candidates.push(base64Key);
  }

  if (HEX_KEY_REGEX.test(raw)) {
    candidates.push(Buffer.from(raw, 'hex'));
  }

  const deduped = candidates.filter(
    (candidate, index) =>
      candidates.findIndex((other) => other.equals(candidate)) === index,
  );

  if (deduped.length === 0) {
    throw new Error(
      `${label} must decode to exactly 32 bytes (base64 standard; 64-char hex accepted for compatibility)`,
    );
  }

  return deduped;
}

function getPrimaryEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error('ENCRYPTION_KEY env var is not set');
  return decodeKeyCandidates(raw, 'ENCRYPTION_KEY')[0];
}

function getDecryptionKeys(): Buffer[] {
  const current = process.env.ENCRYPTION_KEY;
  if (!current) throw new Error('ENCRYPTION_KEY env var is not set');

  const keys: Buffer[] = [...decodeKeyCandidates(current, 'ENCRYPTION_KEY')];
  const legacyRaw = process.env.ENCRYPTION_KEY_LEGACY;

  if (legacyRaw) {
    for (const entry of legacyRaw.split(/[,\r\n]+/).map((value) => value.trim()).filter(Boolean)) {
      keys.push(...decodeKeyCandidates(entry, 'ENCRYPTION_KEY_LEGACY'));
    }
  }

  return keys.filter(
    (candidate, index) =>
      keys.findIndex((other) => other.equals(candidate)) === index,
  );
}

/**
 * Encrypts a UTF-8 plaintext string.
 * Returns a base64 string: IV (12 B) + AuthTag (16 B) + Ciphertext.
 */
export function encrypt(plaintext: string): string {
  const key = getPrimaryEncryptionKey();
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
    const buf = Buffer.from(ciphertext, 'base64');

    // Too short to be a valid encrypted value — legacy plaintext row
    if (buf.length < IV_BYTES + TAG_BYTES + 1) {
      return { plaintext: ciphertext, usedFallback: true };
    }

    for (const key of getDecryptionKeys()) {
      try {
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
        continue;
      }
    }

    return { plaintext: ciphertext, usedFallback: true };
  } catch {
    // Decryption failed — return raw value (pre-encryption legacy row)
    return { plaintext: ciphertext, usedFallback: true };
  }
}
