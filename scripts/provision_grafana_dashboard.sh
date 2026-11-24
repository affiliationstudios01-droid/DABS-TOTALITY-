#!/usr/bin/env bash
# provision_grafana_dashboard.sh
# Affiliation Studios / TOTALITY — Automated Grafana dashboard provisioner
# Source of truth: GitHub (affiliationstudios01-droid/DABS-TOTALITY- or ops companion)
#
# Usage:
#   export GRAFANA_URL="https://your-grafana.example.com"
#   export GRAFANA_API_KEY="glsa_..."          # preferred
#   # or GRAFANA_USER / GRAFANA_PASS for basic auth
#   ./provision_grafana_dashboard.sh [path/to/dashboard.json]
#
# Exit codes: 0 success | 1 missing file / config | 2 API failure

set -euo pipefail

GRAFANA_URL="${GRAFANA_URL:-}"
GRAFANA_API_KEY="${GRAFANA_API_KEY:-}"
GRAFANA_USER="${GRAFANA_USER:-admin}"
GRAFANA_PASS="${GRAFANA_PASS:-admin}"
DASHBOARD_FILE="${1:-./out/grafana-dashboard.json}"

log()  { printf '%s\n' "$*"; }
err()  { printf 'ERROR: %s\n' "$*" >&2; }
die()  { err "$*"; exit 1; }

command -v jq   >/dev/null 2>&1 || die "jq is required"
command -v curl >/dev/null 2>&1 || die "curl is required"

[[ -n "$GRAFANA_URL" ]] || die "GRAFANA_URL is not set"
[[ -f "$DASHBOARD_FILE" ]] || die "Dashboard JSON not found: $DASHBOARD_FILE"

# Normalize URL (strip trailing slash)
GRAFANA_URL="${GRAFANA_URL%/}"

log "Provisioning dashboard from: $DASHBOARD_FILE"
log "Target Grafana: $GRAFANA_URL"

PAYLOAD=$(jq -n --slurpfile db "$DASHBOARD_FILE" '{
  dashboard: $db[0],
  overwrite: true,
  message: "Automated deployment via Affiliation Studios / TOTALITY provisioner"
}')

TMP_BODY=$(mktemp)
TMP_CODE=$(mktemp)
trap 'rm -f "$TMP_BODY" "$TMP_CODE"' EXIT

if [[ -n "$GRAFANA_API_KEY" ]]; then
  HTTP_CODE=$(curl -sS -o "$TMP_BODY" -w "%{http_code}" \
    -X POST "${GRAFANA_URL}/api/dashboards/db" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${GRAFANA_API_KEY}" \
    -d "$PAYLOAD")
else
  HTTP_CODE=$(curl -sS -o "$TMP_BODY" -w "%{http_code}" \
    -X POST "${GRAFANA_URL}/api/dashboards/db" \
    -H "Content-Type: application/json" \
    -u "${GRAFANA_USER}:${GRAFANA_PASS}" \
    -d "$PAYLOAD")
fi

if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "201" ]]; then
  URL=$(jq -r '.url // empty' < "$TMP_BODY")
  UID=$(jq -r '.uid // empty' < "$TMP_BODY")
  log "Dashboard provisioned successfully (HTTP $HTTP_CODE)"
  [[ -n "$UID" ]] && log "UID: $UID"
  [[ -n "$URL" ]] && log "URL: ${GRAFANA_URL}${URL}"
  exit 0
fi

err "Failed to provision dashboard (HTTP $HTTP_CODE)"
err "Response: $(cat "$TMP_BODY")"
exit 2
