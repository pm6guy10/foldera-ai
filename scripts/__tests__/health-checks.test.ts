import { afterEach, describe, expect, it, vi } from 'vitest';
import { isHealthCiRelaxedMode } from '../health-checks';

describe('isHealthCiRelaxedMode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is false when CI is not set (local strict health)', () => {
    vi.stubEnv('CI', undefined);
    vi.stubEnv('HEALTH_STRICT_PRODUCTION', undefined);
    expect(isHealthCiRelaxedMode()).toBe(false);
  });

  it('is false when CI is set and HEALTH_STRICT_PRODUCTION=1', () => {
    vi.stubEnv('CI', 'true');
    vi.stubEnv('HEALTH_STRICT_PRODUCTION', '1');
    expect(isHealthCiRelaxedMode()).toBe(false);
  });

  it('is true on GitHub Actions when not forcing strict', () => {
    vi.stubEnv('CI', 'true');
    vi.stubEnv('HEALTH_STRICT_PRODUCTION', undefined);
    expect(isHealthCiRelaxedMode()).toBe(true);
  });
});
