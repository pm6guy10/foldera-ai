import { describe, expect, it } from 'vitest';
import {
  isBudgetRpcAllowed,
  parseBudgetRpcData,
} from '@/lib/cron/api-budget';

describe('api-budget helpers', () => {
  it('parseBudgetRpcData handles single object', () => {
    const row = { allowed: true, spent_cents: 5 };
    expect(parseBudgetRpcData(row)).toEqual(row);
  });

  it('parseBudgetRpcData handles single-element array', () => {
    const row = { allowed: false, spent_cents: 3000 };
    expect(parseBudgetRpcData([row])).toEqual(row);
  });

  it('isBudgetRpcAllowed fails closed on null and errors', () => {
    expect(isBudgetRpcAllowed(null)).toBe(false);
    expect(isBudgetRpcAllowed(undefined)).toBe(false);
    expect(isBudgetRpcAllowed({})).toBe(false);
    expect(isBudgetRpcAllowed({ allowed: false })).toBe(false);
    expect(isBudgetRpcAllowed({ allowed: 'true' })).toBe(false);
  });

  it('isBudgetRpcAllowed true only for strict boolean', () => {
    expect(isBudgetRpcAllowed({ allowed: true })).toBe(true);
    expect(isBudgetRpcAllowed([{ allowed: true }])).toBe(true);
  });
});
