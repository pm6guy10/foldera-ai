/**
 * CE-2 — Monthly burn from decrypted financial-ish signals (conviction engine).
 * Pure heuristics; kept in a small module so scorer/generator stay focused.
 */

/**
 * Prefer dollar amounts that appear on 2+ distinct days (proxy for recurring bills),
 * with tie-break by day-count then amount. If none qualify, use amounts that appear
 * 3+ times in the window (thread repeats / multiple line items for one bill).
 * Falls back to legacy “top five amounts” sum.
 */
export function estimateMonthlyBurnFromSignalAmounts(
  entries: Array<{ amounts: number[]; dateKey: string }>,
): number | null {
  const amountToDays = new Map<number, Set<string>>();
  const amountOccurrences = new Map<number, number>();
  const pool: number[] = [];

  for (const e of entries) {
    for (const amount of e.amounts) {
      if (amount < 50 || amount > 5000) continue;
      const key = Math.round(amount);
      pool.push(amount);
      amountOccurrences.set(key, (amountOccurrences.get(key) ?? 0) + 1);
      if (e.dateKey) {
        if (!amountToDays.has(key)) amountToDays.set(key, new Set());
        amountToDays.get(key)!.add(e.dateKey);
      }
    }
  }

  const strongRecurring = [...amountToDays.entries()]
    .filter(([, days]) => days.size >= 2)
    .sort((a, b) => {
      if (b[1].size !== a[1].size) return b[1].size - a[1].size;
      return b[0] - a[0];
    })
    .map(([amt]) => amt);

  if (strongRecurring.length > 0) {
    const top = strongRecurring.slice(0, 5);
    return Math.round(top.reduce((s, n) => s + n, 0));
  }

  const weakRecurring = [...amountOccurrences.entries()]
    .filter(([key, occ]) => occ >= 3 && (amountToDays.get(key)?.size ?? 0) >= 1)
    .sort((a, b) => b[0] - a[0])
    .map(([amt]) => amt);

  if (weakRecurring.length > 0) {
    const top = weakRecurring.slice(0, 5);
    return Math.round(top.reduce((s, n) => s + n, 0));
  }

  if (pool.length < 2) return null;
  const sorted = [...pool].sort((a, b) => b - a);
  return Math.round(sorted.slice(0, 5).reduce((s, n) => s + n, 0));
}
