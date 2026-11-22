/**
 * workers/index.ts — BullMQ worker entrypoint.
 *
 * Starts all three BullMQ workers against one shared queue set.
 * Run with: pnpm worker:bullmq   (after `pnpm build`)
 *
 * SCAFFOLD: requires REDIS_URL; provider logic inside the workers is
 * stubbed (see each worker file).
 */

import { createQueues } from "../queues/queues.js";
import { redisConnection } from "../queues/connection.js";
import { startReconciliationWorker } from "./reconciliation.worker.js";
import { startWebhookWorker } from "./webhook.worker.js";
import { startSagaStarterWorker } from "./saga-starter.worker.js";

async function main() {
  const queues = createQueues(redisConnection());

  const workers = [
    startWebhookWorker(queues),
    startReconciliationWorker(queues),
    startSagaStarterWorker(),
  ];

  console.log(
    `[bullmq] workers started: webhook-processing, payment-reconciliation, start-purchase-saga`,
  );

  const shutdown = async () => {
    await Promise.all(workers.map((w) => w.close()));
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[bullmq] fatal:", err);
  process.exit(1);
});
