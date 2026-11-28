import express, { NextFunction, Request, Response } from "express";
import { Webhook, WebhookUnbrandedRequiredHeaders, WebhookVerificationError } from "standardwebhooks";
import { RenderDeploy, RenderEvent, RenderKeyValue, RenderPostgres, RenderService, WebhookPayload } from "./render.js";

const app = express();
const port = Number(process.env.PORT) || 3001;
const host = "0.0.0.0";
const renderWebhookSecret = process.env.RENDER_WEBHOOK_SECRET || "";
const renderAPIURL = process.env.RENDER_API_URL || "https://api.render.com/v1";
// To create a Render API token, follow instructions here: https://render.com/docs/api#1-create-an-api-key
const renderAPIToken = process.env.RENDER_API_TOKEN || "";

app.get("/health", (_req: Request, res: Response) => { res.status(200).json({ ok: true }); });

app.post("/webhook", express.raw({ type: "application/json" }), (req: Request, res: Response, next: NextFunction) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : typeof req.body === "string" ? req.body : "";
  try { validateWebhook(req, rawBody); } catch (error) { return next(error); }
  const payload: WebhookPayload = JSON.parse(rawBody);
  res.status(200).send({}).end();
  // handle the webhook async so we don't timeout the request
  void handleWebhook(payload);
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  if (err instanceof WebhookVerificationError) { res.status(400).send({}).end(); } else { res.status(500).send({}).end(); }
});

const server = app.listen(port, host, () => console.log(`Example app listening on http://${host}:${port}!`));

function validateWebhook(req: Request, rawBody: string) {
  const headers: WebhookUnbrandedRequiredHeaders = {
    "webhook-id": req.header("webhook-id") || "",
    "webhook-timestamp": req.header("webhook-timestamp") || "",
    "webhook-signature": req.header("webhook-signature") || ""
  };
  const wh = new Webhook(renderWebhookSecret);
  wh.verify(rawBody, headers);
}

async function handleWebhook(payload: WebhookPayload) {
  try {
    switch (payload.type) {
      case "deploy_started":
        const event = await fetchEventInfo(payload);
        const deploy = await fetchDeployInfo(payload.data.serviceId, event.details.deployId);
        const service = await fetchServiceInfo(payload);
        if (deploy.commit) { console.log(`deploy started for service ${service.name} with commit "${deploy.commit.message}"`); }
        else if (deploy.image) { console.log(`deploy started for service ${service.name} with image sha "${deploy.image.sha}"`); }
        return;
      case "database_available":
        const postgres = await fetchPostgresInfo(payload);
        console.log(`${payload.type} for postgres ${postgres.name}`);
        return;
      case "key_value_available":
        const keyValue = await fetchKeyValueInfo(payload);
        console.log(`${payload.type} for key value ${keyValue.name}`);
        return;
      default:
        console.log(`unhandled webhook type ${payload.type} for service ${payload.data.serviceId}`);
    }
  } catch (error) { console.error(error); }
}

async function fetchEventInfo(payload: WebhookPayload): Promise<RenderEvent> {
  const res = await fetch(`${renderAPIURL}/events/${payload.data.id}`, {
    method: "get",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${renderAPIToken}`,
    },
  });
  if (res.ok) return res.json() as Promise<RenderEvent>;
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
    }
  );
  if (res.ok) return res.json() as Promise<RenderDeploy>;
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
  if (res.ok) return res.json() as Promise<RenderService>;
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
  if (res.ok) return res.json() as Promise<RenderPostgres>;
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
  if (res.ok) return res.json() as Promise<RenderKeyValue>;
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
