/**
 * queues.ts — BullMQ queue definitions (v40 hybrid spec).
 *
 * BullMQ owns high-frequency, short-lived, and scheduled work:
 *   - payment reconciliation (Stripe / Square / Cash App)
 *   - webhook processing / normalization
 *   - delayed follow-ups, retries, rate-limited work
 *   - the saga-starter hand-off that launches Temporal workflows
 *
 * BullMQ does NOT own the durable purchase saga — that is Temporal's job
 * (see src/temporal/). Keeping the boundary clean is the whole point of
 * the hybrid: queues move events; workflows own multi-step truth.
 *
 * SCAFFOLD: queues are defined and exported; no live Redis is assumed.
 */

import { Queue } from "bullmq";
import type { ConnectionOptions } from "bullmq";

export const QUEUE_NAMES = {
  /** Inbound provider webhooks awaiting signature check + normalization. */
  webhookProcessing: "webhook-processing",
  /** Periodic reconciliation sweeps per payment provider. */
  paymentReconciliation: "payment-reconciliation",
  /** Hand-off queue: a worker here starts the Temporal PurchaseSaga. */
  sagaStarter: "start-purchase-saga",
} as const;

export type PaymentProvider = "stripe" | "square" | "cash_app";

export interface WebhookJobData {
  provider: PaymentProvider | "shopify" | "render";
  /** Provider event id — also the mesh dedupe key (see mesh SQL). */
  eventId: string;
  /** Raw payload as received; verification happens in the worker. */
  payload: unknown;
  receivedAt: string; // ISO 8601
}

export interface ReconciliationJobData {
  provider: PaymentProvider;
  /** Window being reconciled, ISO 8601 bounds. */
  windowStart: string;
  windowEnd: string;
}

export interface SagaStarterJobData {
  transactionId: string;
  organizationId: string;
  sku: string;
  quantity: number;
  /** Amount in integer cents. */
  amountCents: number;
  paymentMethod: PaymentProvider;
}

export function createQueues(connection: ConnectionOptions) {
  const defaultJobOptions = {
    attempts: 5,
    backoff: { type: "exponential" as const, delay: 30_000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  };

  return {
    webhookProcessing: new Queue<WebhookJobData>(
      QUEUE_NAMES.webhookProcessing,
      { connection, defaultJobOptions },
    ),
    paymentReconciliation: new Queue<ReconciliationJobData>(
      QUEUE_NAMES.paymentReconciliation,
      { connection, defaultJobOptions },
    ),
    sagaStarter: new Queue<SagaStarterJobData>(QUEUE_NAMES.sagaStarter, {
      connection,
      defaultJobOptions,
    }),
  };
}

export type Queues = ReturnType<typeof createQueues>;
