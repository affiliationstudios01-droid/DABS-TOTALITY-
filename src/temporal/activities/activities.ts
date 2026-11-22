/**
 * activities.ts — Temporal activities for the PurchaseSaga.
 *
 * EVERY activity here is a STUB. Each one is written to be IDEMPOTENT —
 * keyed on the transaction id — because Temporal retries activities and
 * a retried activity must not double-charge, double-reserve, or
 * double-post. Real implementations land behind the same signatures once
 * provider credentials arrive via the Secure Vault.
 *
 * Nothing in this file moves real money or touches a live service.
 */

import { splitRevenue, type SplitShare } from "../../ledger/split.js";

export interface ReserveInventoryInput {
  organizationId: string;
  sku: string;
  quantity: number;
  transactionId: string;
}

export interface FulfillmentInput {
  transactionId: string;
  organizationId: string;
  sku: string;
  quantity: number;
}

export interface LedgerInput {
  transactionId: string;
  /** Amount in integer cents. */
  amountCents: number;
  paymentMethod: string;
}

export interface LedgerResult {
  ledgerEntryId: string;
  shares: SplitShare[];
}

/** STUB — reserve inventory for the order. Idempotency key: transactionId. */
export async function reserveInventory(
  input: ReserveInventoryInput,
): Promise<{ reservationId: string }> {
  // TODO(live): INSERT reservation keyed on transactionId
  // (unique constraint) or call the commerce provider's inventory API.
  return { reservationId: `stub-reservation-${input.transactionId}` };
}

/** STUB — compensation for reserveInventory. Safe to call repeatedly. */
export async function releaseInventory(
  input: ReserveInventoryInput,
): Promise<void> {
  // TODO(live): release the reservation created for input.transactionId.
  void input;
}

/** STUB — submit fulfillment (e.g. Shopify / Gelato). Idempotency key: transactionId. */
export async function submitFulfillment(
  input: FulfillmentInput,
): Promise<{ fulfillmentId: string }> {
  // TODO(live): create the fulfillment order keyed on transactionId.
  return { fulfillmentId: `stub-fulfillment-${input.transactionId}` };
}

/**
 * STUB — post ledger entries using the CONFIRMED seven-way split
 * (see src/ledger/split.ts). The split math is real; the persistence is
 * not — entries are computed and returned, not written anywhere yet.
 * Idempotency key: transactionId.
 */
export async function postLedger(input: LedgerInput): Promise<LedgerResult> {
  const shares = splitRevenue(input.amountCents);
  // TODO(live): INSERT one ledger entry per share, unique on
  // (transactionId, bucket key), inside one DB transaction.
  return { ledgerEntryId: `stub-ledger-${input.transactionId}`, shares };
}

/** STUB — compensation for postLedger: reverse the entries for this transaction. */
export async function reverseLedger(input: LedgerInput): Promise<void> {
  // TODO(live): post reversing entries keyed on input.transactionId.
  void input;
}

/** STUB — notify the customer / ops. Idempotency key: transactionId. */
export async function notifyCustomer(input: {
  transactionId: string;
  fulfillmentId: string;
}): Promise<void> {
  // TODO(live): send receipt/notification once per transactionId.
  void input;
}
