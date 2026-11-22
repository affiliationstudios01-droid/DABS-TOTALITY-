# DABS / Totality Webhook Receiver — Standalone Web Service

Affiliation Studios LLC. The hybrid webhook receiver tailored from
`render-examples/webhook-receiver`, packaged as its **own Render Web Service** —
separate from the `DABS-TOTALITY-` Workflow service (workflows register tasks
and expose no public URL; this service is the public endpoint).

## Endpoints

| Route | Auth | Purpose |
|---|---|---|
| `POST /webhook` | Render signature (`standardwebhooks`) | Render event webhooks. Verifies the signature, dedupes by `webhook-id`, acks 200 immediately, then enriches via the Render API (deploy / database / key-value events) and forwards telemetry to the Seven Sins Ops Engine. |
| `POST /webhooks/commerce` | `x-admin-api-key` | Internal commerce intake (Shopify / Stripe / Square order events in the `CommerceOrderEvent` shape). Carves the 10–15% publisher reserve **before** payout, computes the canonical seven-way split, forwards to Seven Sins, syncs the verified order to HubSpot. Provider platforms cannot call this directly — it is an internal ingress, not a provider webhook target. |
| `POST /api/totality/split-preview` | `x-admin-api-key` | Preview the canonical seven-way split for `{ paidCents, feeCents, cogsCents, state }`. |
| `GET /health` | none | Status + which integrations are configured (booleans only, never values). Also the Render health-check path. |

## Money rule

Canonical seven-way split on net profit (paid − fees − COGS), integer cents,
largest-remainder rounding, sums exact: Executive Vault 20% / Legacy Trust 20% /
Crypto Scale 20% / Operations 10% / Event Reserve 10% / Co-Manager A 10% /
Co-Manager B 10%. Same math as `src/ledger/split.ts` in DABS-TOTALITY-.
Note: in this file the 10% Operations and Event Reserve buckets carry the key
names `DELTA_RELO_STRIPE_OPS` and `EPSILON_CHIME_SQUARE_EVENT_RESERVE` —
percentages and roles match the confirmed split; the naming is as pasted.

## Environment variables

Names only — set values in the Render dashboard. See `.env.example`.

- `RENDER_WEBHOOK_SECRET` — signing secret of the Render webhook pointed at this service's `/webhook` URL. (Creating Render webhooks requires a Professional plan or higher.)
- `RENDER_API_TOKEN` — Render API key for event enrichment lookups. The upstream example README calls this `RENDER_API_KEY`; this code reads `RENDER_API_TOKEN`.
- `ADMIN_API_KEY` — guards the admin endpoints; the blueprint generates one (`generateValue: true`). Endpoints fail closed (503) when unset.
- `SEVEN_SINS_ENGINE_URL` — default `https://seven-sins-ops-engine.onrender.com`.
- `SEVEN_SINS_INGEST_PATH` — **open item.** Default `/api/events/ingest` is not a route on the live engine. The verified route inventory (Swagger, 2026-11-22) is: `/api/wrath` (+`/trigger`), `/api/greed` (+`/profit`), `/api/pride` (+`/signal`), `/api/envy` (+`/log`), `/api/lust` (+`/lead`, `/lead/{id}/convert`), `/api/gluttony`, `/api/sloth` (+`/trigger`), `/cmd/run`, `/webhooks/stripe`, `/webhooks/shopify`, `/`. Until the ingest target is confirmed, bridge forwards log a warning and the rest of the pipeline is unaffected.
- `HUBSPOT_ACCESS_TOKEN` — optional; sync is skipped with a log line when unset.

## Deploy to Render

1. Push this folder to a GitHub repo Render can access. (As of 2026-11-22 it
   lives in `DABS-TOTALITY-` under `receiver/` — the Muse GitHub App cannot
   create new repositories, so it shares that repo with the workflow service
   and is isolated by the Root Directory setting below.)
2. Render dashboard → New → Web Service, select the repo, and set
   **Root Directory: `receiver`**, build `npm install && npm run build`,
   start `npm start`, health check path `/health`. (If this folder ever gets
   its own repo, a Blueprint deploy can use `render.yaml` directly.)
3. Set the secret env values in the dashboard.
4. Create a Render webhook pointing to `https://<service>.onrender.com/webhook`
   and put its secret in `RENDER_WEBHOOK_SECRET`.
5. Trigger a deploy and watch for events in the service logs.

## Local development

```bash
npm install
npm run build
ADMIN_API_KEY=local-test RENDER_WEBHOOK_SECRET=local-secret npm start
curl localhost:3001/health
curl -X POST localhost:3001/api/totality/split-preview \
  -H 'Content-Type: application/json' -H 'x-admin-api-key: local-test' \
  -d '{"paidCents":30000,"feeCents":0,"cogsCents":0}'
# → netProfitCents 30000, shares 6000/6000/6000/3000/3000/3000/3000
```

## Known limits (as designed)

- Idempotency is an in-memory `Set` — resets on restart and does not span
  instances. The durable dedupe lives in the DABS-TOTALITY- mesh tables.
- No provider HMAC verification on the commerce endpoint (admin-key ingress by
  design); provider-native webhooks belong on the engine's own
  `/webhooks/stripe` and `/webhooks/shopify` routes or the scaffold's
  signature-checked queue worker.
