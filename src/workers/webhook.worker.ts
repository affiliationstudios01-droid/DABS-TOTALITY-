/**
 * webhook.worker.ts — BullMQ worker: webhook processing.
 *
 * Receives raw provider webhooks (enqueued by the HTTP receiver in
 * app.ts), verifies signatures, dedupes against the input mesh
 * (input_mesh_event on connector_id + dedupe_key — see mesh SQL), and
 * routes confirmed payment events to reconciliation / the saga-starter
 * hand-off.
 *
 * SCAFFOLD / STUB: signature verification is a placeholder that FAILS
 * CLOSED. Do not relax it: an unverified webhook must never move money.
 * Real HMAC verification lands with the real secrets via Secure Vault.
 *
 * Known secret state (2026-11-21):
 *  - RENDER_WEBHOOK_SECRET: exists only as a Secret File on the Render
 *    workflow service; must ALSO be set as an environment variable.
 *  - SHOPIFY_WEBHOOK_SECRET: set as an env var; match against Shopify
 *    Admin is UNVERIFIED.
 */

import { Worker, type Job } from "bullmq";
import { redisConnection } from "../queues/connection.js";
import {
  QUEUE_NAMES,
  type Queues,
  type WebhookJobData,
} from "../queues/queues.js";

/**
 * STUB — always rejects. Replace with per-provider HMAC verification
 * (Shopify: X-Shopify-Hmac-Sha256; Stripe: Stripe-Signature; Square:
 * x-square-hmacsha256-signature) using secrets from the environment.
 */
async function verifySignature(_job: Job<WebhookJobData>): Promise<boolean> {
  return false;
}

/** STUB — replace with an INSERT ... ON CONFLICT DO NOTHING against
 *  input_mesh_event; returns true when the event is new. */
async function recordMeshEvent(_job: Job<WebhookJobData>): Promise<boolean> {
  return true;
}

export function startWebhookWorker(queues: Queues) {
  const worker = new Worker<WebhookJobData>(
    QUEUE_NAMES.webhookProcessing,
    async (job) => {
      if (!(await verifySignature(job))) {
        // Fail closed. Throwing routes the job to BullMQ retry/DLQ
        // handling instead of silently processing a bad webhook.
        throw new Error(
          `webhook signature verification failed or not yet implemented (provider=${job.data.provider}, event=${job.data.eventId})`,
        );
      }

      const isNew = await recordMeshEvent(job);
      if (!isNew) return { deduped: true };

      // Confirmed payment events hand off to reconciliation, which owns
      // the decision to start the Temporal saga.
      await queues.paymentReconciliation.add("reconcile-now", {
        provider:
          job.data.provider === "shopify" || job.data.provider === "render"
            ? "stripe" // TODO(live): map webhook source -> payment provider properly
            : job.data.provider,
        windowStart: job.data.receivedAt,
        windowEnd: job.data.receivedAt,
      });
      return { deduped: false };
    },
    { connection: redisConnection(), concurrency: 10 },
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[webhook] job ${job?.id} (${job?.data.provider}/${job?.data.eventId}) failed:`,
      err,
    );
  });
  return worker;
}
