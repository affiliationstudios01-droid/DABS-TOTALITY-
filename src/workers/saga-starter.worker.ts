/**
 * saga-starter.worker.ts — the BullMQ -> Temporal hand-off (v40 spec).
 *
 * This worker's ONLY job is to start the durable Temporal PurchaseSaga
 * for a confirmed payment. The workflow id is derived from the
 * transaction id (`purchase-<transactionId>`), so Temporal itself
 * dedupes: starting the same workflow id twice returns the existing
 * workflow instead of running the saga twice.
 */

import { Worker } from "bullmq";
import { Client, Connection } from "@temporalio/client";
import { redisConnection } from "../queues/connection.js";
import {
  QUEUE_NAMES,
  type SagaStarterJobData,
} from "../queues/queues.js";
import { PurchaseSaga } from "../temporal/workflows.js";

export const PURCHASE_TASK_QUEUE =
  process.env.TEMPORAL_TASK_QUEUE ?? "purchase-saga";

async function temporalClient(): Promise<Client> {
  const connection = await Connection.connect({
    address: process.env.TEMPORAL_ADDRESS, // undefined -> localhost default
  });
  return new Client({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
  });
}

export function startSagaStarterWorker() {
  const worker = new Worker<SagaStarterJobData>(
    QUEUE_NAMES.sagaStarter,
    async (job) => {
      const client = await temporalClient();
      const handle = await client.workflow.start(PurchaseSaga, {
        args: [job.data],
        taskQueue: PURCHASE_TASK_QUEUE,
        workflowId: `purchase-${job.data.transactionId}`,
      });
      return { workflowId: handle.workflowId, runId: handle.firstExecutionRunId };
    },
    { connection: redisConnection(), concurrency: 10 },
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[saga-starter] job ${job?.id} (tx=${job?.data.transactionId}) failed:`,
      err,
    );
  });
  return worker;
}
