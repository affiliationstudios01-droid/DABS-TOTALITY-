/**
 * purchase-saga.ts — Temporal workflow: the durable purchase saga (v40).
 *
 * Payment captured -> reserve inventory -> submit fulfillment ->
 * post ledger (confirmed seven-way split) -> notify customer.
 *
 * Temporal owns this flow because failure mid-way has financial
 * consequences: every completed step pushes a compensation onto the
 * stack, and on failure the stack unwinds in reverse (release
 * inventory, reverse ledger). The workflow survives worker crashes and
 * deploys; BullMQ only starts it (see workers/saga-starter.worker.ts).
 *
 * Workflow code is deterministic — no direct I/O, no Date.now(), no
 * randomness. All side effects live in activities.
 */

import { proxyActivities, log } from "@temporalio/workflow";
import type * as activities from "../activities/activities.js";

const {
  reserveInventory,
  releaseInventory,
  submitFulfillment,
  postLedger,
  reverseLedger,
  notifyCustomer,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: { maximumAttempts: 5 },
});

export interface PurchaseSagaInput {
  transactionId: string;
  organizationId: string;
  sku: string;
  quantity: number;
  /** Amount in integer cents. */
  amountCents: number;
  paymentMethod: "stripe" | "square" | "cash_app";
}

export interface PurchaseSagaResult {
  status: "completed";
  fulfillmentId: string;
  ledgerEntryId: string;
}

export async function PurchaseSaga(
  input: PurchaseSagaInput,
): Promise<PurchaseSagaResult> {
  const compensations: Array<() => Promise<void>> = [];

  try {
    // Step 1 — reserve inventory (compensate: release).
    const { reservationId } = await reserveInventory({
      organizationId: input.organizationId,
      sku: input.sku,
      quantity: input.quantity,
      transactionId: input.transactionId,
    });
    void reservationId;
    compensations.push(() =>
      releaseInventory({
        organizationId: input.organizationId,
        sku: input.sku,
        quantity: input.quantity,
        transactionId: input.transactionId,
      }),
    );

    // Step 2 — submit fulfillment (no compensation defined in the v40
    // spec beyond alerting ops; a submitted fulfillment is cancelled
    // operationally, not silently, so it is not auto-compensated here).
    const { fulfillmentId } = await submitFulfillment({
      transactionId: input.transactionId,
      organizationId: input.organizationId,
      sku: input.sku,
      quantity: input.quantity,
    });

    // Step 3 — post ledger with the confirmed seven-way split
    // (compensate: reverse entries).
    const ledger = await postLedger({
      transactionId: input.transactionId,
      amountCents: input.amountCents,
      paymentMethod: input.paymentMethod,
    });
    compensations.push(() =>
      reverseLedger({
        transactionId: input.transactionId,
        amountCents: input.amountCents,
        paymentMethod: input.paymentMethod,
      }),
    );

    // Step 4 — notify.
    await notifyCustomer({
      transactionId: input.transactionId,
      fulfillmentId,
    });

    return {
      status: "completed",
      fulfillmentId,
      ledgerEntryId: ledger.ledgerEntryId,
    };
  } catch (err) {
    // Unwind compensations in reverse order. A failed compensation is
    // logged loudly for ops escalation — never swallowed silently.
    for (const compensate of compensations.reverse()) {
      try {
        await compensate();
      } catch (compErr) {
        log.error("CRITICAL: compensation failed", {
          transactionId: input.transactionId,
          error: String(compErr),
        });
      }
    }
    throw err;
  }
}
