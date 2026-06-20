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
  /** True when decryption succeeded using ENCRYPTION_KEY_LEGACY (never logged with key material). */
  decryptedWithLegacyKey?: boolean;
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

function tryDecryptBuffer(buf: Buffer, key: Buffer): string | null {
  try {
    const iv = buf.subarray(0, IV_BYTES);
    const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const encrypted = buf.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

let legacyDecryptLogEmitted = false;

function emitLegacyDecryptLogOnce(): void {
  if (legacyDecryptLogEmitted) return;
  legacyDecryptLogEmitted = true;
  console.log(
    JSON.stringify({
      event: 'encryption_decrypt_legacy_key_used',
      note: 'ciphertext decrypted with ENCRYPTION_KEY_LEGACY; no secrets in this log',
    }),
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
 * @deprecated Use decryptWithStatus() instead.
 * Returns ciphertext string silently on failure.
 * decryptWithStatus() returns { plaintext, usedFallback }.
 */
export function decrypt(ciphertext: string): string {
  return decryptWithStatus(ciphertext).plaintext;
}

/**
 * Heuristic: does this raw value look like AES-GCM ciphertext we simply could
 * not decrypt (the right key is absent), as opposed to a legacy/plaintext row
 * stored unencrypted? Long + pure base64 ⇒ almost certainly ciphertext; real
 * plaintext (spaces, punctuation, newlines) fails the base64 test.
 *
 * #481 FORMAT GAP: `decryptWithStatus` returns `usedFallback: true` for BOTH
 * undecryptable ciphertext AND legacy plaintext. Callers that drop on
 * `usedFallback` alone silently discard readable plaintext rows (uploaded
 * documents, AI-conversation exports) from grounding. Gate the drop on this
 * helper so only genuinely-unreadable ciphertext is skipped.
 */
export function looksLikeEncryptedPayload(value: string | null | undefined): boolean {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 80 && /^[A-Za-z0-9+/=]+$/.test(trimmed);
}

export function decryptWithStatus(ciphertext: string): DecryptResult {
  try {
    const buf = Buffer.from(ciphertext, 'base64');

    // Too short to be a valid encrypted value — legacy plaintext row
    if (buf.length < IV_BYTES + TAG_BYTES + 1) {
      return { plaintext: ciphertext, usedFallback: true };
    }

    const current = process.env.ENCRYPTION_KEY;
    if (!current) throw new Error('ENCRYPTION_KEY env var is not set');
    for (const key of decodeKeyCandidates(current, 'ENCRYPTION_KEY')) {
      const pt = tryDecryptBuffer(buf, key);
      if (pt !== null) return { plaintext: pt, usedFallback: false };
    }

    const legacyRaw = process.env.ENCRYPTION_KEY_LEGACY;
    if (legacyRaw) {
      for (const entry of legacyRaw.split(/[,\r\n]+/).map((value) => value.trim()).filter(Boolean)) {
        for (const key of decodeKeyCandidates(entry, 'ENCRYPTION_KEY_LEGACY')) {
          const pt = tryDecryptBuffer(buf, key);
          if (pt !== null) {
            emitLegacyDecryptLogOnce();
            return { plaintext: pt, usedFallback: false, decryptedWithLegacyKey: true };
          }
        }
      }
    }

    return { plaintext: ciphertext, usedFallback: true };
  } catch {
    return { plaintext: ciphertext, usedFallback: true };
  }
}
