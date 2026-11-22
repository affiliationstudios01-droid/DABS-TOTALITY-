/**
 * ledger/split.ts — CONFIRMED Totality OS seven-way revenue split.
 *
 * This is the split the user confirmed on 2026-11-18 from the downloaded
 * code (verified in both the SQL split function and the Telegram
 * notifier). Do NOT substitute any other split found in other materials —
 * several different schemes exist in the user's other documents and they
 * are NOT this one.
 *
 *   Executive Vault  20%
 *   Legacy Trust     20%
 *   Crypto Scale     20%
 *   Operations       10%
 *   Event Reserve    10%
 *   Co-Manager A     10%
 *   Co-Manager B     10%
 *   -------------------
 *   Total           100%
 *
 * All math is integer cents. Shares are computed with the
 * largest-remainder method so the parts always sum EXACTLY to the input —
 * no cent is created or destroyed by rounding.
 */

export interface SplitShare {
  /** Stable bucket key. */
  key: string;
  /** Human-readable bucket name. */
  name: string;
  /** Percentage points (20 means 20%). */
  percent: number;
  /** Allocated amount in integer cents. */
  cents: number;
}

export const SPLIT_BUCKETS = [
  { key: "executive_vault", name: "Executive Vault", percent: 20 },
  { key: "legacy_trust", name: "Legacy Trust", percent: 20 },
  { key: "crypto_scale", name: "Crypto Scale", percent: 20 },
  { key: "operations", name: "Operations", percent: 10 },
  { key: "event_reserve", name: "Event Reserve", percent: 10 },
  { key: "co_manager_a", name: "Co-Manager A", percent: 10 },
  { key: "co_manager_b", name: "Co-Manager B", percent: 10 },
] as const;

export type SplitBucketKey = (typeof SPLIT_BUCKETS)[number]["key"];

/**
 * Split an amount (integer cents) across the seven confirmed buckets.
 *
 * Largest-remainder method:
 *  1. exact share = totalCents * percent / 100 (may be fractional)
 *  2. floor each share
 *  3. distribute the leftover cents one at a time to the buckets with the
 *     largest fractional remainders (ties broken by bucket order)
 *
 * @throws if totalCents is not a non-negative safe integer.
 */
export function splitRevenue(totalCents: number): SplitShare[] {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new Error(
      `splitRevenue: totalCents must be a non-negative integer, got ${totalCents}`,
    );
  }

  const exact = SPLIT_BUCKETS.map((b) => (totalCents * b.percent) / 100);
  const cents = exact.map((v) => Math.floor(v));
  let remainder = totalCents - cents.reduce((a, b) => a + b, 0);

  // Indices sorted by fractional remainder, descending; stable for ties.
  const byRemainder = SPLIT_BUCKETS.map((_, i) => i).sort((a, b) => {
    const fa = exact[a] - Math.floor(exact[a]);
    const fb = exact[b] - Math.floor(exact[b]);
    return fb - fa || a - b;
  });

  for (let i = 0; remainder > 0; i = (i + 1) % byRemainder.length) {
    cents[byRemainder[i]] += 1;
    remainder -= 1;
  }

  return SPLIT_BUCKETS.map((b, i) => ({
    key: b.key,
    name: b.name,
    percent: b.percent,
    cents: cents[i],
  }));
}
