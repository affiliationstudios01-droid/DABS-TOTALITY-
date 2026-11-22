/**
 * mesh/connectors.ts — input-mesh v80 connector manifest.
 *
 * Adapted from the v80 spec's connectors.toml. EVERY connector ships in
 * `pending` status with a `secret_ref` POINTER ONLY — never a secret
 * value. A connector flips to `active` only after its real credential
 * lands in the secret store via the Secure Vault and an adapter exists.
 *
 * Declared is not connected. This file is a registry of intent.
 */

export type ConnectorStatus =
  | "pending"
  | "active"
  | "paused"
  | "error"
  | "retired";

export interface MeshConnector {
  id: string;
  displayName: string;
  platform: string;
  category: "commerce" | "ai" | "content" | "social";
  direction: "inbound" | "outbound" | "bidirectional";
  authKind: "oauth2" | "api_key" | "hmac" | "webhook";
  /** Pointer into the secret store, e.g. vault://mesh/shopify/webhook. Never a value. */
  secretRef: string;
  status: ConnectorStatus;
  /** Standard 5-field crontab — mirrors the sync_interval row. */
  cron: string;
  batchSize: number;
}

const pending = "pending" as const;

export const CONNECTORS: MeshConnector[] = [
  {
    id: "shopify.store",
    displayName: "Shopify Storefront (xix123-70.myshopify.com)",
    platform: "shopify",
    category: "commerce",
    direction: "bidirectional",
    authKind: "hmac",
    secretRef: "vault://mesh/shopify/webhook",
    status: pending,
    cron: "*/2 * * * *",
    batchSize: 200,
  },
  {
    id: "shopify.api",
    displayName: "Shopify Admin API",
    platform: "shopify",
    category: "commerce",
    direction: "outbound",
    authKind: "oauth2",
    secretRef: "vault://mesh/shopify/admin_token",
    status: pending,
    cron: "*/15 * * * *",
    batchSize: 250,
  },
  {
    id: "vercel.mesh",
    displayName: "Vercel Deployments",
    platform: "vercel",
    category: "content",
    direction: "inbound",
    authKind: "api_key",
    secretRef: "vault://mesh/vercel/token",
    status: pending,
    cron: "*/10 * * * *",
    batchSize: 50,
  },
  {
    id: "wordpress.affiliation",
    displayName: "Affiliation Studios WP",
    platform: "wordpress",
    category: "content",
    direction: "outbound",
    authKind: "api_key",
    secretRef: "vault://mesh/wordpress/app_password",
    status: pending,
    cron: "0 */6 * * *",
    batchSize: 25,
  },
  {
    id: "wix.site",
    displayName: "Wix Site (Affiliation Studios)",
    platform: "wix",
    category: "content",
    direction: "outbound",
    authKind: "oauth2",
    secretRef: "vault://mesh/wix/oauth",
    status: pending,
    cron: "0 */6 * * *",
    batchSize: 25,
  },
  {
    id: "jetpack.wp",
    displayName: "Jetpack Stats",
    platform: "jetpack",
    category: "content",
    direction: "inbound",
    authKind: "oauth2",
    secretRef: "vault://mesh/jetpack/oauth",
    status: pending,
    cron: "0 * * * *",
    batchSize: 100,
  },
  {
    id: "discord.ops",
    displayName: "Ops Discord",
    platform: "discord",
    category: "social",
    direction: "outbound",
    authKind: "webhook",
    secretRef: "vault://mesh/discord/ops_webhook",
    status: pending,
    cron: "* * * * *",
    batchSize: 25,
  },
  {
    id: "twitch.stream",
    displayName: "Twitch EventSub",
    platform: "twitch",
    category: "social",
    direction: "inbound",
    authKind: "oauth2",
    secretRef: "vault://mesh/twitch/oauth",
    status: pending,
    cron: "*/5 * * * *",
    batchSize: 100,
  },
  {
    id: "capcut.assets",
    displayName: "CapCut Asset Library",
    platform: "capcut",
    category: "content",
    direction: "inbound",
    authKind: "api_key",
    secretRef: "vault://mesh/capcut/token",
    status: pending,
    cron: "0 */12 * * *",
    batchSize: 20,
  },
  {
    id: "grok.signal",
    displayName: "Grok Signal Feed",
    platform: "grok",
    category: "ai",
    direction: "bidirectional",
    authKind: "api_key",
    secretRef: "vault://mesh/grok/api_key",
    status: pending,
    cron: "*/30 * * * *",
    batchSize: 50,
  },
  {
    id: "grokpi.analytics",
    displayName: "GrokPI Analytics",
    platform: "grokpi",
    category: "ai",
    direction: "outbound",
    authKind: "api_key",
    secretRef: "vault://mesh/grokpi/api_key",
    status: pending,
    cron: "0 */4 * * *",
    batchSize: 100,
  },
  {
    id: "claude.review",
    displayName: "Claude Review Queue",
    platform: "claude",
    category: "ai",
    direction: "outbound",
    authKind: "api_key",
    secretRef: "vault://mesh/anthropic/api_key",
    status: pending,
    cron: "*/20 * * * *",
    batchSize: 25,
  },
  {
    id: "genspark.agent",
    displayName: "Genspark Agent Bridge",
    platform: "genspark",
    category: "ai",
    direction: "bidirectional",
    authKind: "api_key",
    secretRef: "vault://mesh/genspark/api_key",
    status: pending,
    cron: "*/30 * * * *",
    batchSize: 25,
  },
];
