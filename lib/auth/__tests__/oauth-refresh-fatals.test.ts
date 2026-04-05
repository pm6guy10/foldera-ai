import { describe, expect, it } from 'vitest';
import {
  isGoogleRefreshFatalError,
  isMicrosoftRefreshFatalError,
} from '../oauth-refresh-fatals';

describe('isMicrosoftRefreshFatalError', () => {
  it('flags invalid_grant', () => {
    expect(isMicrosoftRefreshFatalError('invalid_grant', '')).toBe(true);
  });

  it('flags AADSTS refresh revoked in description', () => {
    expect(
      isMicrosoftRefreshFatalError(
        'invalid_grant',
        'AADSTS700082: The refresh token has expired due to inactivity.',
      ),
    ).toBe(true);
  });

  it('does not flag unknown error codes', () => {
    expect(isMicrosoftRefreshFatalError('temporarily_unavailable', 'try later')).toBe(false);
  });
});

describe('isGoogleRefreshFatalError', () => {
  it('flags invalid_grant', () => {
    expect(isGoogleRefreshFatalError('invalid_grant', '')).toBe(true);
  });

  it('flags revoked wording in description', () => {
    expect(
      isGoogleRefreshFatalError(
        'invalid_grant',
        'Token has been expired or revoked.',
      ),
    ).toBe(true);
  });
});
