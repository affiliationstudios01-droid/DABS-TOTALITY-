# Air Ops Telemetry — OpenTelemetry + Airtable Mesh

**Protocol:** INPUT → MESH → INTEGRATE → ACTIVATE → SYNC → EXECUTE  
**Version spine:** v1 → v3 → v9 → v15 → v23 → v35 → v49 → v54 → v63 → **v7 (air)**  
**Source of truth:** GitHub [`affiliationstudios01-droid/DABS-TOTALITY-`](https://github.com/affiliationstudios01-droid/DABS-TOTALITY-)

## What this adds

| Layer | Component | Role |
|-------|-----------|------|
| Observability | `telemetry/instrumentation.ts` | OTLP traces + metrics (auto HTTP/Express) |
| Mesh node | `mesh/airtable.ts` | Airtable sync with span instrumentation |
| Provision | existing `scripts/provision_grafana_dashboard.sh` | Dashboard push to Grafana |

## Env vars

```bash
# OpenTelemetry
OTEL_SERVICE_NAME=dabs-totality
OTEL_SERVICE_VERSION=v63-air
OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.example.com   # or localhost:4318

# Airtable
AIRTABLE_API_KEY=pat...
AIRTABLE_BASE_ID=app...
AIRTABLE_TABLE=Ops Ledger
```

## Run (local)

```bash
# 1. Install OTEL deps (add to package.json)
pnpm add @opentelemetry/sdk-node \
  @opentelemetry/api \
  @opentelemetry/auto-instrumentations-node \
  @opentelemetry/exporter-trace-otlp-http \
  @opentelemetry/exporter-metrics-otlp-http \
  @opentelemetry/sdk-metrics \
  @opentelemetry/resources \
  @opentelemetry/semantic-conventions

# 2. Build then start with instrumentation preload
pnpm run build
node --require ./dist/telemetry/instrumentation.js dist/app.js
```

## Mesh flow (ledger → Airtable)

```
Webhook / manual split
        │
        ▼
  ledger_transaction + ledger_entry (7-way)
        │
        ▼
  ledgerLineToAirFields()     # INTEGRATE
        │
        ▼
  syncToAirtable()            # SYNC (idempotent on external_id = source_system:source_event_id:bucket_code)
        │
        ▼
  OTEL span: airtable.sync    # OBSERVE
```

## Grafana

After traces/metrics reach your collector → Prometheus/Tempo (or vendor):

```bash
export GRAFANA_URL=...
export GRAFANA_API_KEY=...
./scripts/provision_grafana_dashboard.sh ./out/grafana-dashboard.json
```

## GitHub commit targets (DABS-TOTALITY-)

```
telemetry/instrumentation.ts
mesh/airtable.ts
docs/AIR_OPS_TELEMETRY.md
scripts/provision_grafana_dashboard.sh   # already prepared
```

Keep ledger migrations and Render Workflows in separate PRs.
