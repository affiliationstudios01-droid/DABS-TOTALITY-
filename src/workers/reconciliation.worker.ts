/**
 * reconciliation.worker.ts — BullMQ worker: payment reconciliation.
 *
 * Per the v40 spec, reconciliation is BullMQ's job: high-frequency,
 * scheduled, provider-by-provider sweeps that normalize external payment
 * events. When a sweep confirms a captured payment that has not yet run
 * the purchase saga, it hands off by enqueueing a saga-starter job —
 * BullMQ never runs saga steps itself.
 *
 * SCAFFOLD / STUB: provider fetch functions are placeholders. No live API
 * calls are made. Wire real provider clients only after credentials land
 * via the Secure Vault.
 */

import { Worker, type Job } from "bullmq";
import { redisConnection } from "../queues/connection.js";
import {
  QUEUE_NAMES,
  type Queues,
  type ReconciliationJobData,
} from "../queues/queues.js";

interface NormalizedPayment {
  transactionId: string;
  organizationId: string;
  sku: string;
  quantity: number;
  amountCents: number;
  paymentMethod: ReconciliationJobData["provider"];
  /** True if this payment already has a saga (avoid double-starting). */
  sagaAlreadyStarted: boolean;
}

/** STUB — replace with real provider API reads (Stripe / Square / Cash App). */
async function fetchProviderPayments(
  job: Job<ReconciliationJobData>,
): Promise<NormalizedPayment[]> {
  // TODO(live): query job.data.provider for captures in
  // [windowStart, windowEnd], normalize to integer cents.
  void job;
  return [];
}

export function startReconciliationWorker(queues: Queues) {
  const worker = new Worker<ReconciliationJobData>(
    QUEUE_NAMES.paymentReconciliation,
    async (job) => {
      const payments = await fetchProviderPayments(job);

      let handedOff = 0;
      for (const p of payments) {
        if (p.sagaAlreadyStarted) continue;
        // Deterministic job id = transaction id: a retried sweep cannot
        // enqueue the same saga twice.
        await queues.sagaStarter.add(
          "start-purchase-saga",
          {
            transactionId: p.transactionId,
            organizationId: p.organizationId,
            sku: p.sku,
            quantity: p.quantity,
            amountCents: p.amountCents,
            paymentMethod: p.paymentMethod,
          },
          { jobId: `saga-${p.transactionId}` },
        );
        handedOff += 1;
      }
      return { checked: payments.length, handedOff };
    },
    { connection: redisConnection(), concurrency: 5 },
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[reconciliation] job ${job?.id} (${job?.data.provider}) failed:`,
      err,
    );
  });
  return worker;
}
