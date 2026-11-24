# GitHub as Source of Truth — Affiliation Studios Ops

## Current public surface

| Repo | Role | Status |
|------|------|--------|
| [affiliationstudios01-droid/DABS-TOTALITY-](https://github.com/affiliationstudios01-droid/DABS-TOTALITY-) | Render webhook receiver (TypeScript) | **Active public SoT** |
| Private / local `seven-sins-ops-engine` | FastAPI control plane, ledger, workflows | Not yet mirrored publicly |

`DABS-TOTALITY-` is the only confirmed public repository under the account with push access in this session. All ops scripts, Blueprints, and ledger migrations should land there (or a dedicated `affiliation-ops` repo) before being treated as deployed truth.

## Contribution model (adapted from established open-source practice)

Reference pattern: [facebook/react CONTRIBUTING.md](https://github.com/facebook/react/blob/main/CONTRIBUTING.md)

For Affiliation Studios:

1. **Discuss non-trivial changes first** (issue or short design note).
2. **One concern per PR** — dashboard provisioner, ledger migration, Render Blueprint, UI filter, etc. stay separate.
3. **Tests / dry-run before merge** — ledger invariants, webhook idempotency, Grafana API dry-run where possible.
4. **No secrets in git** — use Render/Vercel/Supabase env vars and Secret Files; never commit keys.
5. **Main is deployable** — only merge what has been validated against staging.

## Recommended next commits into DABS-TOTALITY- (or new ops repo)

```
scripts/
  provision_grafana_dashboard.sh
docs/
  GITHUB_SOURCE_OF_TRUTH.md
  LEDGER_7WAY.md
infra/
  render.yaml                 # extend with dabs-redis + workflow service
migrations/
  001_ledger_7way.sql
```

## Deploy path (current)

```
GitHub (main)
    │
    ├─► Render  (Blueprint / webhook receiver / future workflows)
    ├─► Vercel  (Procurement OS / control UI)
    └─► Supabase (Postgres 7-way ledger)
```

Grafana provisioner runs as a post-deploy step (CI job or manual) against your Grafana instance using `GRAFANA_URL` + `GRAFANA_API_KEY`.

## Guardrails

- Do not treat chat pastes as source of truth.
- Do not merge multi-thread dumps into a single PR.
- Prefer integer cents + deferred invariants for any money path.
- Keep deterministic policy (MarginGuard, split weights) ahead of agents.
