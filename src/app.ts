/**
 * app.ts — service entrypoint (matches the existing DABS-TOTALITY-
 * Render workflow service: start command `node dist/app.js`).
 *
 * Minimal HTTP webhook receiver: accepts provider webhooks, enqueues
 * them on BullMQ's webhook-processing queue, and returns immediately.
 * All verification and processing happen in the workers — the receiver
 * never trusts a payload.
 *
 * STARTUP GUARD: this process refuses to boot when RENDER_WEBHOOK_SECRET
 * is absent from the ENVIRONMENT. That is exactly the failure that
 * killed the 2026-11-20 deploy: the secret existed only as a Secret
 * File, which the app cannot read from env. Failing loudly at boot with
 * the fix spelled out beats dying silently at registration.
 *
 * SCAFFOLD: no live providers are called from here.
 */

import { createServer } from "node:http";
import { createQueues } from "./queues/queues.js";
import { redisConnection } from "./queues/connection.js";
import type { PaymentProvider } from "./queues/queues.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `[app] FATAL: ${name} is not set as an environment variable. ` +
        `If it exists only as a Secret File, the app cannot read it — ` +
        `add it as a regular environment variable on the service and redeploy.`,
    );
    process.exit(1);
  }
  return value;
}

const PROVIDERS = new Set(["stripe", "square", "cash_app", "shopify", "render"]);

async function main() {
  requireEnv("RENDER_WEBHOOK_SECRET");

  const queues = createQueues(redisConnection());
  const port = Number(process.env.PORT ?? 10000);

  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    const match = req.url?.match(/^\/webhooks\/([a-z_]+)$/);
    if (req.method === "POST" && match && PROVIDERS.has(match[1])) {
      const provider = match[1] as PaymentProvider | "shopify" | "render";
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c as Buffer));
      req.on("end", async () => {
        let payload: unknown = null;
        try {
          payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "invalid JSON" }));
          return;
        }
        const eventId =
          (payload as { id?: string })?.id ??
          `${provider}-${Date.now()}`; // TODO(live): use the provider's real event id header/body field
        await queues.webhookProcessing.add("webhook", {
          provider,
          eventId,
          payload,
          receivedAt: new Date().toISOString(),
        });
        res.writeHead(202, { "content-type": "application/json" });
        res.end(JSON.stringify({ accepted: true }));
      });
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  server.listen(port, () => {
    console.log(`[app] webhook receiver listening on :${port}`);
  });
}

main().catch((err) => {
  console.error("[app] fatal:", err);
  process.exit(1);
});
