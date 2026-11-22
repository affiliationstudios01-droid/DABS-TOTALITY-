/**
 * connection.ts — shared Redis connection options for BullMQ.
 *
 * SCAFFOLD: reads REDIS_URL from the environment. On Render this is the
 * Key Value instance's connection string, supplied via Secure Vault /
 * service env — never hard-coded.
 */

import type { ConnectionOptions } from "bullmq";

export function redisConnection(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      "REDIS_URL is not set. BullMQ workers cannot start without it. " +
        "Set it from the secret store (see .env.example).",
    );
  }
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    // BullMQ requires this to be null for blocking commands.
    maxRetriesPerRequest: null,
  };
}
