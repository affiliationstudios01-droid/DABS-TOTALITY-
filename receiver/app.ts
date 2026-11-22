import crypto from "crypto";
import express, { NextFunction, Request, Response } from "express";
import {
  Webhook,
  WebhookUnbrandedRequiredHeaders,
  WebhookVerificationError,
} from "standardwebhooks";
import {
  RenderDeploy,
  RenderEvent,
  RenderKeyValue,
  RenderPostgres,
  RenderService,
  WebhookPayload,
} from "./render";

// ============================================================================
// Affiliation Studios LLC — Hybrid DABS / Totality Webhook Receiver (app.ts)
// Tailored from render-examples/webhook-receiver (add-api-types) for:
//   1. Render Workspace: AffiliationStud-droid-project
//   2. Backend Bridge:   seven-sins-ops-engine (FastAPI + 10-15% Reserve/Clawback)
//   3. CRM Sync:         HubSpot Playbook (Email dedupe, Consent, Verified Deals)
//   4. Money Rule:       Canonical 7-Way Integer-Cent Split (20/20/20/10/10/10/10)
// ============================================================================

const app = express();
const port = process.env.PORT || 3001;

// Secrets & service URLs — strictly from environment variables
const renderWebhookSecret = process.env.RENDER_WEBHOOK_SECRET || "";
const renderAPIURL = process.env.RENDER_API_URL || "https://api.render.com/v1";
const renderAPIToken = process.env.RENDER_API_TOKEN || "";

const sevenSinsEngineURL =
  process.env.SEVEN_SINS_ENGINE_URL || "http://127.0.0.1:8000";
// NOTE: the live seven-sins-ops-engine route inventory (Swagger, 2026-11-22)
// has no /api/events/ingest route. This path is configurable so the bridge
// target can be corrected without a code change; until it matches a real
// engine route, forwards return non-OK and are only logged as warnings.
const sevenSinsIngestPath =
  process.env.SEVEN_SINS_INGEST_PATH || "/api/events/ingest";
const adminApiKey = process.env.ADMIN_API_KEY || "";

const hubspotAccessToken = process.env.HUBSPOT_ACCESS_TOKEN || "";
const hubspotApiBase = "https://api.hubapi.com";

// Idempotency guard (replace with Redis/PostgreSQL table in multi-instance prod)
const processedWebhookIds = new Set<string>();

// ----------------------------------------------------------------------------
// Types: DABS / Totality & HubSpot Playbook
// ----------------------------------------------------------------------------

type PublisherTier = "Alpha" | "Beta" | "Gamma";
type SettlementState = "projected" | "cleared" | "paid";
type ConsentStatus = "subscribed" | "unsubscribed" | "never_subscribed";

interface CanonicalSevenWaySplit {
  netProfitCents: number;
  state: SettlementState;
  shares: {
    ALPHA_EXECUTIVE_VAULT: number; // 20%
    BETA_LEGACY_TRUST: number; // 20%
    GAMMA_CRYPTO_SCALE: number; // 20%
    DELTA_RELO_STRIPE_OPS: number; // 10%
    EPSILON_CHIME_SQUARE_EVENT_RESERVE: number; // 10%
    ZETA_CO_MANAGER_A: number; // 10%
    ETA_CO_MANAGER_B: number; // 10%
  };
}

interface CommerceOrderEvent {
  eventId: string;
  source: "shopify" | "stripe" | "square";
  orderId: string;
  customerEmail: string;
  firstName?: string;
  lastName?: string;
  utmSource?: string;
  consentStatus?: ConsentStatus;
  paidCents: number;
  feeCents: number;
  cogsCents: number;
  publisherTier?: PublisherTier;
  publisherReserveRate?: number; // 0.10 to 0.15
  state: SettlementState;
}

// ----------------------------------------------------------------------------
// Auth Middleware (Fixes Seven Sins Audit Finding #3: no unauthenticated admin)
// ----------------------------------------------------------------------------

function requireAdminKey(req: Request, res: Response, next: NextFunction) {
  if (!adminApiKey) {
    return res
      .status(503)
      .json({ error: "ADMIN_API_KEY is not configured on the host." });
  }
  const provided = req.header("x-admin-api-key") || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(adminApiKey);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  return next();
}

// ----------------------------------------------------------------------------
// 1. Render Webhook Endpoint (standardwebhooks + Immediate 200 Ack)
// ----------------------------------------------------------------------------

app.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req: Request, res: Response, next: NextFunction) => {
    try {
      validateWebhook(req);
    } catch (error) {
      return next(error);
    }

    const webhookId = req.header("webhook-id") || "";
    if (webhookId && processedWebhookIds.has(webhookId)) {
      return res.status(200).send({ duplicate: true }).end();
    }
    if (webhookId) {
      processedWebhookIds.add(webhookId);
    }

    const payload: WebhookPayload = JSON.parse(req.body.toString("utf8"));

    // Acknowledge immediately so Render does not time out
    res.status(200).send({}).end();

    // Hybrid async dispatch: Render API enrichment -> Seven Sins Ops Engine
    handleRenderWebhook(payload);
  }
);

// ----------------------------------------------------------------------------
// 2. Hybrid Commerce / DABS Totality Endpoint (Shopify / Stripe / Square)
// ----------------------------------------------------------------------------

app.post(
  "/webhooks/commerce",
  express.json({ limit: "256kb" }),
  requireAdminKey,
  (req: Request, res: Response) => {
    const order = req.body as CommerceOrderEvent;
    if (!order?.eventId || !order?.orderId || !order?.customerEmail) {
      return res.status(400).json({ error: "Missing required order fields." });
    }

    if (processedWebhookIds.has(order.eventId)) {
      return res.status(200).json({ duplicate: true });
    }
    processedWebhookIds.add(order.eventId);

    // Acknowledge immediately, process DABS 7-way split + HubSpot + Seven Sins async
    res.status(200).json({ accepted: true, eventId: order.eventId });
    handleCommerceOrder(order);
  }
);

// ----------------------------------------------------------------------------
// 3. Health & Split Preview Endpoints
// ----------------------------------------------------------------------------

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    workspace: "AffiliationStud-droid-project",
    integrations: {
      renderApiConfigured: Boolean(renderAPIToken),
      renderWebhookSecretConfigured: Boolean(renderWebhookSecret),
      sevenSinsEngineURL,
      hubspotConfigured: Boolean(hubspotAccessToken),
    },
  });
});

app.post(
  "/api/totality/split-preview",
  express.json(),
  requireAdminKey,
  (req: Request, res: Response) => {
    const { paidCents = 0, feeCents = 0, cogsCents = 0, state = "projected" } =
      req.body || {};
    const split = computeCanonicalSevenWaySplit(
      Number(paidCents),
      Number(feeCents),
      Number(cogsCents),
      state
    );
    res.status(200).json(split);
  }
);

// Error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  if (err instanceof WebhookVerificationError) {
    res.status(400).send({}).end();
  } else {
    res.status(500).send({}).end();
  }
});

const server = app.listen(port, () =>
  console.log(`Hybrid DABS/Seven-Sins webhook receiver listening on port ${port}`)
);

// ----------------------------------------------------------------------------
// Render Signature Verification & Event Routing
// ----------------------------------------------------------------------------

function validateWebhook(req: Request) {
  if (!renderWebhookSecret) {
    throw new Error("RENDER_WEBHOOK_SECRET is not configured.");
  }
  const headers: WebhookUnbrandedRequiredHeaders = {
    "webhook-id": req.header("webhook-id") || "",
    "webhook-timestamp": req.header("webhook-timestamp") || "",
    "webhook-signature": req.header("webhook-signature") || "",
  };

  const wh = new Webhook(renderWebhookSecret);
  wh.verify(req.body, headers);
}

async function handleRenderWebhook(payload: WebhookPayload) {
  try {
    switch (payload.type) {
      case "deploy_started": {
        const event = await fetchEventInfo(payload);
        const deploy = await fetchDeployInfo(
          payload.data.serviceId,
          event.details.deployId
        );
        const service = await fetchServiceInfo(payload);

        const summary = deploy.commit
          ? `deploy started for ${service.name} with commit "${deploy.commit.message}"`
          : `deploy started for ${service.name} with image sha "${deploy.image?.sha}"`;

        console.log(summary);
        await forwardTelemetryToSevenSins("render.deploy_started", {
          serviceId: payload.data.serviceId,
          serviceName: service.name,
          deployId: event.details.deployId,
          summary,
        });
        return;
      }
      case "database_available": {
        const postgres = await fetchPostgresInfo(payload);
        console.log(`${payload.type} for postgres ${postgres.name}`);
        await forwardTelemetryToSevenSins("render.database_available", {
          serviceId: payload.data.serviceId,
          postgresName: postgres.name,
        });
        return;
      }
      case "key_value_available": {
        const keyValue = await fetchKeyValueInfo(payload);
        console.log(`${payload.type} for key value ${keyValue.name}`);
        await forwardTelemetryToSevenSins("render.key_value_available", {
          serviceId: payload.data.serviceId,
          keyValueName: keyValue.name,
        });
        return;
      }
      default:
        console.log(
          `unhandled webhook type ${payload.type} for service ${payload.data.serviceId}`
        );
    }
  } catch (error) {
    console.error("Error in handleRenderWebhook:", error);
  }
}

// ----------------------------------------------------------------------------
// Hybrid DABS / Totality + Seven Sins + HubSpot Order Pipeline
// ----------------------------------------------------------------------------

async function handleCommerceOrder(order: CommerceOrderEvent) {
  try {
    // 1. Carve out rolling publisher reserve (10%-15%) before payout if applicable
    const reserveRate = clampReserveRate(order.publisherReserveRate ?? 0.1);
    const grossNetCents = Math.max(
      0,
      order.paidCents - order.feeCents - order.cogsCents
    );
    const reserveHeldCents = Math.round(grossNetCents * reserveRate);
    const distributableNetCents = grossNetCents - reserveHeldCents;

    // 2. Compute canonical 7-way integer-cent split (20/20/20/10/10/10/10)
    const split = computeCanonicalSevenWaySplit(
      distributableNetCents,
      0,
      0,
      order.state
    );

    // 3. Forward to Seven Sins Ops Engine (FastAPI) for ledger + LLM readout
    await forwardTelemetryToSevenSins("commerce.order_processed", {
      orderId: order.orderId,
      source: order.source,
      publisherTier: order.publisherTier || "Alpha",
      reserveRate,
      reserveHeldCents,
      split,
    });

    // 4. Sync verified order to HubSpot Playbook (Contact + Deal, never on clicks alone)
    await syncVerifiedOrderToHubSpot(order);
  } catch (error) {
    console.error("Error in handleCommerceOrder:", error);
  }
}

function clampReserveRate(rate: number): number {
  if (Number.isNaN(rate)) return 0.1;
  return Math.min(0.15, Math.max(0.1, rate));
}

/**
 * Canonical 7-Way Split (Locked Oct 26, 2026 / Nov 3, 2026):
 *   net profit = paid - fees - COGS (integer cents, largest-remainder rounding)
 *   20% ALPHA (Executive Vault) / 20% BETA (Legacy Trust) / 20% GAMMA (Crypto Scale) /
 *   10% Delta (RELO-STRIPE Ops) / 10% Epsilon (CHIME-SQUARE Event Reserve) /
 *   10% Zeta (Co-Manager A) / 10% Eta (Co-Manager B)
 */
export function computeCanonicalSevenWaySplit(
  paidCents: number,
  feeCents: number,
  cogsCents: number,
  state: SettlementState = "projected"
): CanonicalSevenWaySplit {
  const netProfitCents = Math.max(0, Math.round(paidCents - feeCents - cogsCents));

  const weights: Array<[keyof CanonicalSevenWaySplit["shares"], number]> = [
    ["ALPHA_EXECUTIVE_VAULT", 20],
    ["BETA_LEGACY_TRUST", 20],
    ["GAMMA_CRYPTO_SCALE", 20],
    ["DELTA_RELO_STRIPE_OPS", 10],
    ["EPSILON_CHIME_SQUARE_EVENT_RESERVE", 10],
    ["ZETA_CO_MANAGER_A", 10],
    ["ETA_CO_MANAGER_B", 10],
  ];

  const exact = weights.map(([key, pct]) => {
    const raw = (netProfitCents * pct) / 100;
    const floored = Math.floor(raw);
    return { key, floored, remainder: raw - floored };
  });

  let remaining =
    netProfitCents - exact.reduce((sum, item) => sum + item.floored, 0);

  // Largest fractional remainder distribution to guarantee zero decimal variance
  const byRemainder = [...exact].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < byRemainder.length && remaining > 0; i++) {
    byRemainder[i].floored += 1;
    remaining -= 1;
  }

  const shares = Object.fromEntries(
    exact.map((item) => [item.key, item.floored])
  ) as CanonicalSevenWaySplit["shares"];

  return { netProfitCents, state, shares };
}

// ----------------------------------------------------------------------------
// Seven Sins Ops Engine Bridge (FastAPI)
// ----------------------------------------------------------------------------

async function forwardTelemetryToSevenSins(
  eventType: string,
  data: Record<string, unknown>
) {
  try {
    const res = await fetch(`${sevenSinsEngineURL}${sevenSinsIngestPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(adminApiKey ? { "X-Admin-API-Key": adminApiKey } : {}),
      },
      body: JSON.stringify({ eventType, timestamp: new Date().toISOString(), data }),
    });
    if (!res.ok) {
      console.warn(
        `seven-sins-ops-engine returned ${res.status} for ${eventType}`
      );
    }
  } catch (err) {
    console.warn(`seven-sins-ops-engine unreachable for ${eventType}:`, err);
  }
}

// ----------------------------------------------------------------------------
// HubSpot Playbook Sync (Email Dedupe + Consent Rule + Verified Paid Deal)
// ----------------------------------------------------------------------------

async function syncVerifiedOrderToHubSpot(order: CommerceOrderEvent) {
  if (!hubspotAccessToken) {
    console.info(
      `HubSpot sync skipped for order ${order.orderId} (HUBSPOT_ACCESS_TOKEN not configured)`
    );
    return;
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${hubspotAccessToken}`,
  };

  // 1. Upsert Contact by email (never overwrite an existing "unsubscribed" status)
  const contactProperties: Record<string, string> = {
    email: order.customerEmail,
    lifecyclestage: "customer", // Customer only on verified Shopify/Stripe/Square sale
  };
  if (order.firstName) contactProperties.firstname = order.firstName;
  if (order.lastName) contactProperties.lastname = order.lastName;
  if (order.utmSource) contactProperties.hs_analytics_source = order.utmSource;
  if (order.consentStatus === "subscribed") {
    contactProperties.consent_status = "subscribed";
  }

  await fetch(`${hubspotApiBase}/crm/v3/objects/contacts`, {
    method: "POST",
    headers,
    body: JSON.stringify({ properties: contactProperties }),
  });

  // 2. Create Deal linked to verified order
  await fetch(`${hubspotApiBase}/crm/v3/objects/deals`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      properties: {
        dealname: `${order.source.toUpperCase()} Order #${order.orderId}`,
        pipeline: "default",
        dealstage: "closedwon",
        amount: (order.paidCents / 100).toFixed(2),
      },
    }),
  });
}

// ----------------------------------------------------------------------------
// Render REST API Helpers (from render-examples/webhook-receiver/add-api-types)
// ----------------------------------------------------------------------------

async function fetchEventInfo(payload: WebhookPayload): Promise<RenderEvent> {
  const res = await fetch(`${renderAPIURL}/events/${payload.data.id}`, {
    method: "get",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${renderAPIToken}`,
    },
  });
  if (res.ok) return res.json();
  throw new Error(`unable to fetch event info; received code :${res.status}`);
}

async function fetchDeployInfo(
  serviceId: string,
  deployId: string
): Promise<RenderDeploy> {
  const res = await fetch(
    `${renderAPIURL}/services/${serviceId}/deploys/${deployId}`,
    {
      method: "get",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${renderAPIToken}`,
      },
    },
  );
  if (res.ok) return res.json();
  throw new Error(`unable to fetch deploy info; received code :${res.status}`);
}

async function fetchServiceInfo(
  payload: WebhookPayload
): Promise<RenderService> {
  const res = await fetch(
    `${renderAPIURL}/services/${payload.data.serviceId}`,
    {
      method: "get",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${renderAPIToken}`,
      },
    }
  );
  if (res.ok) return res.json();
  throw new Error(`unable to fetch service info; received code :${res.status}`);
}

async function fetchPostgresInfo(
  payload: WebhookPayload
): Promise<RenderPostgres> {
  const res = await fetch(
    `${renderAPIURL}/postgres/${payload.data.serviceId}`,
    {
      method: "get",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${renderAPIToken}`,
      },
    }
  );
  if (res.ok) return res.json();
  throw new Error(`unable to fetch postgres info; received code :${res.status}`);
}

async function fetchKeyValueInfo(
  payload: WebhookPayload
): Promise<RenderKeyValue> {
  const res = await fetch(
    `${renderAPIURL}/key-value/${payload.data.serviceId}`,
    {
      method: "get",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${renderAPIToken}`,
      },
    }
  );
  if (res.ok) return res.json();
  throw new Error(
    `unable to fetch key value info; received code :${res.status}`
  );
}

process.on("SIGTERM", () => {
  console.debug("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.debug("HTTP server closed");
  });
});
