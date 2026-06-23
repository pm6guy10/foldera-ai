import { describe, expect, it } from 'vitest';
import {
  normalizeMicrosoftAccountEmail,
  providerDisplayName,
  shouldUpdateStoredMicrosoftEmail,
} from '../provider-display';

describe('normalizeMicrosoftAccountEmail', () => {
  it('recovers the real email from an Azure guest UPN (#EXT#)', () => {
    expect(
      normalizeMicrosoftAccountEmail('b-kapp_outlook.com#EXT#@bkappoutlook.onmicrosoft.com'),
    ).toBe('b-kapp@outlook.com');
  });

  it('matches #EXT# case-insensitively (sync path lowercases the UPN)', () => {
    expect(
      normalizeMicrosoftAccountEmail('b-kapp_outlook.com#ext#@bkappoutlook.onmicrosoft.com'),
    ).toBe('b-kapp@outlook.com');
  });

  it('passes a clean email through untouched', () => {
    expect(normalizeMicrosoftAccountEmail('b.kapp1010@gmail.com')).toBe('b.kapp1010@gmail.com');
  });

  it('returns "" for empty/nullish input so callers can apply their own fallback', () => {
    expect(normalizeMicrosoftAccountEmail('')).toBe('');
    expect(normalizeMicrosoftAccountEmail('   ')).toBe('');
    expect(normalizeMicrosoftAccountEmail(null)).toBe('');
    expect(normalizeMicrosoftAccountEmail(undefined)).toBe('');
  });

  it('falls back to the prefix when an #EXT# value has no underscore to restore', () => {
    expect(normalizeMicrosoftAccountEmail('plainuser#EXT#@tenant.onmicrosoft.com')).toBe('plainuser');
  });

  it('restores only the last underscore for emails whose local part contains underscores', () => {
    expect(
      normalizeMicrosoftAccountEmail('first_last_outlook.com#EXT#@tenant.onmicrosoft.com'),
    ).toBe('first_last@outlook.com');
  });
});

describe('shouldUpdateStoredMicrosoftEmail (self-heal)', () => {
  const resolved = 'b-kapp@outlook.com'; // already normalized + lowercased

  it('repairs a stuck guest #EXT# UPN that the null-only backfill could never fix', () => {
    expect(
      shouldUpdateStoredMicrosoftEmail(
        'b-kapp_outlook.com#EXT#@bkappoutlook.onmicrosoft.com',
        resolved,
      ),
    ).toBe(true);
  });

  it('backfills a null/empty stored email', () => {
    expect(shouldUpdateStoredMicrosoftEmail(null, resolved)).toBe(true);
    expect(shouldUpdateStoredMicrosoftEmail(undefined, resolved)).toBe(true);
    expect(shouldUpdateStoredMicrosoftEmail('', resolved)).toBe(true);
  });

  it('is idempotent — a healthy row is never rewritten (case/space-insensitive)', () => {
    expect(shouldUpdateStoredMicrosoftEmail('b-kapp@outlook.com', resolved)).toBe(false);
    expect(shouldUpdateStoredMicrosoftEmail('  B-Kapp@Outlook.com ', resolved)).toBe(false);
  });

  it('never wipes a stored email when the Graph lookup resolved nothing', () => {
    expect(shouldUpdateStoredMicrosoftEmail('b-kapp@outlook.com', '')).toBe(false);
    expect(shouldUpdateStoredMicrosoftEmail(null, '')).toBe(false);
  });
});

describe('providerDisplayName', () => {
  it('maps known providers and stays intact after the guest-UPN helper was added', () => {
    expect(providerDisplayName('azure_ad')).toBe('Microsoft');
    expect(providerDisplayName('google')).toBe('Google');
    expect(providerDisplayName(null)).toBe('Unknown source');
  });
});
