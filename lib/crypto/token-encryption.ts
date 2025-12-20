// =====================================================
// TOKEN ENCRYPTION
// Encrypts OAuth tokens before storing in database
// =====================================================

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Get encryption key from environment variable
 * Falls back to a derived key if ENCRYPTION_KEY is not set (for development)
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  
  if (!envKey) {
    // In development, derive from NEXTAUTH_SECRET as fallback
    // WARNING: In production, you MUST set ENCRYPTION_KEY
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'ENCRYPTION_KEY environment variable is required in production. ' +
        'Generate one with: openssl rand -base64 32'
      );
    }
    
    const fallbackSecret = process.env.NEXTAUTH_SECRET || 'dev-secret-change-in-production';
    return scryptSync(fallbackSecret, 'salt', KEY_LENGTH);
  }
  
  // If ENCRYPTION_KEY is provided, use it directly (should be 32 bytes base64)
  try {
    return Buffer.from(envKey, 'base64');
  } catch {
    // If not base64, derive from it
    return scryptSync(envKey, 'salt', KEY_LENGTH);
  }
}

/**
 * Encrypt a token value
 */
export function encryptToken(token: string): string {
  if (!token) {
    return token;
  }

  try {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error: any) {
    throw new Error(`Token encryption failed: ${error.message}`);
  }
}

/**
 * Decrypt a token value
 */
export function decryptToken(encryptedToken: string): string {
  if (!encryptedToken) {
    return encryptedToken;
  }

  // Check if token is already encrypted (has the format iv:authTag:encrypted)
  if (!encryptedToken.includes(':')) {
    // Legacy unencrypted token - return as-is (for migration)
    // TODO: Log warning and migrate to encrypted
    return encryptedToken;
  }

  try {
    const [ivHex, authTagHex, encrypted] = encryptedToken.split(':');
    
    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('Invalid encrypted token format');
    }
    
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error: any) {
    // If decryption fails, might be legacy unencrypted token
    // Log error but return as-is for backward compatibility
    console.error('[Crypto] Decryption failed, might be legacy token:', error.message);
    return encryptedToken;
  }
}

