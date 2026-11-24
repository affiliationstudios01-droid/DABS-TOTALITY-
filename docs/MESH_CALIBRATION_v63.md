# Mesh Calibration — v63 Air Ops + Catalog

**Command:** Configure · Calibrate · Generate · INPUT-MESH-INTEGRATE-ACTIVATE-SYNC  
**Skill:** seven-sins-ops-engine  
**SoT:** [affiliationstudios01-droid/DABS-TOTALITY-](https://github.com/affiliationstudios01-droid/DABS-TOTALITY-)

## Status

| Item | State |
|------|--------|
| Protocol config | **Calibrated** (manifest written) |
| Product CSV | **Generated** (4 products / 11 variants) |
| Airtable mesh node | Ready (code) |
| OpenTelemetry bootstrap | Ready (code) |
| Grafana provisioner | Ready (script) |
| Deployed / live | **No** — requires commit + env + import |

## Catalog (INPUT)

| Handle | Vendor | Variants | Price range |
|--------|--------|----------|-------------|
| playaz-ball-championship-hoodie | Playaz Ball | S–2XL (5) | $65–$70 |
| playaz-ball-game-day-tee | Playaz Ball | S–XL (4) | $38 |
| playaz-ball-snapback | Playaz Ball | One Size | $42 |
| playmakers-association-mentor-tee | Playmakers Association | **S only** | $42 |

Mentor Tee body was truncated in source at “Affi…”. SEO description completed conservatively as Affiliation Studios LLC. **No additional sizes invented.**

## Shopify import

1. Backup existing products.  
2. Admin → Products → Import.  
3. Upload `mesh/catalog_playaz_playmakers.csv`.  
4. Leave **Overwrite products with matching handles** unchecked.  
5. Review preview → confirm.

Existing Playaz Ball SKUs already in store must stay untouched if handles/SKUs differ.

## Unverified claims (do not treat as facts in marketing until confirmed)

- Gelato POD + worldwide shipping setup  
- Organic cotton certification  
- Youth-program donation %  

## Guardrails (calibrated)

- Chat responses do not deploy infrastructure.  
- Pending card → crypto purchases are not spendable until settled.  
- 7-way ledger + MarginGuard stay deterministic and measured.  
- GitHub is the only source of truth for code.

## Next EXECUTE steps (ordered)

1. Commit `mesh/`, `telemetry/`, `scripts/provision_grafana_dashboard.sh` to GitHub.  
2. Add OTEL + Airtable env vars on Render.  
3. Staging: run 7-way ledger SQL; dry-run split.  
4. Import catalog CSV (overwrite off).  
5. Wire one test webhook → ledger → Airtable sync; confirm OTEL span.
