/**
 * temporal/worker.ts — Temporal worker entrypoint for the purchase saga.
 *
 * Run with: pnpm worker:temporal   (after `pnpm build`)
 *
 * SCAFFOLD: requires a reachable Temporal server (TEMPORAL_ADDRESS) or a
 * local dev server. Activities are stubs — see activities/activities.ts.
 */

import { Worker, NativeConnection } from "@temporalio/worker";
import * as activities from "./activities/activities.js";

// Keep in sync with PURCHASE_TASK_QUEUE in workers/saga-starter.worker.ts.
const PURCHASE_TASK_QUEUE = process.env.TEMPORAL_TASK_QUEUE ?? "purchase-saga";

async function main() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS,
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    taskQueue: PURCHASE_TASK_QUEUE,
    workflowsPath: new URL("./workflows.js", import.meta.url).pathname,
    activities,
  });

  console.log(`[temporal] worker listening on task queue: ${PURCHASE_TASK_QUEUE}`);
  await worker.run();
}

main().catch((err) => {
  console.error("[temporal] fatal:", err);
  process.exit(1);
});
