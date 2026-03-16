// =====================================================
// TOKEN ENCRYPTION
// Encrypts OAuth tokens before storing in database
// =====================================================

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;          // 96-bit — GCM standard, matches lib/encryption.ts
const LEGACY_IV_LENGTH = 16;   // Previous non-standard IV size — kept for decryption only
const AUTH_TAG_LENGTH = 16;

/**
 * Returns the AES-256-GCM key, or null in non-production environments.
 * In production, throws if ENCRYPTION_KEY is absent — tokens must be encrypted at rest.
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
function getEncryptionKey(): Buffer | null {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY must be set in production (32-byte base64 value)');
    }
    return null;
  }
  const keyBuffer = Buffer.from(key, 'base64');
  if (keyBuffer.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes (256 bits) when decoded');
  }
  return keyBuffer;
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  // No key configured — store plaintext (acceptable for dev; add ENCRYPTION_KEY in prod)
  if (!key) return plaintext;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encryptedData (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptToken(encryptedData: string): string {
  const key = getEncryptionKey();
  // No key configured — assume value is plaintext passthrough
  if (!key) return encryptedData;

  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }

  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  // Try decryption with the IV as-is (handles both legacy 16-byte and new 12-byte)
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    // If IV was 16-byte legacy format, try trimming to 12-byte standard
    if (iv.length === LEGACY_IV_LENGTH) {
      const trimmedIv = iv.subarray(0, IV_LENGTH);
      const decipher = crypto.createDecipheriv(ALGORITHM, key, trimmedIv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    throw new Error('Failed to decrypt token');
  }
}

export function isEncrypted(value: string): boolean {
  // Check if value matches our encrypted format (iv:authTag:data)
  const parts = value.split(':');
  if (parts.length !== 3) return false;

  const [iv, authTag, data] = parts;
  // Each part should be valid hex; IV can be 12-byte (new) or 16-byte (legacy)
  const hexRegex = /^[0-9a-f]+$/i;
  return (
    (iv.length === IV_LENGTH * 2 || iv.length === LEGACY_IV_LENGTH * 2) &&
    authTag.length === AUTH_TAG_LENGTH * 2 &&
    hexRegex.test(iv) &&
    hexRegex.test(authTag) &&
    hexRegex.test(data)
  );
}

