-- mesh/sql/001_mesh_v80.sql
-- Input-mesh v80 schema, adapted from the user's v80 build spec.
-- Postgres 14+. VARCHAR lengths are deliberate: they are the contract
-- boundary for every external platform payload we accept.
--
-- Apply with:  pnpm mesh:sql
-- (DATABASE_URL must point at the target Postgres — on Render, the
-- seven-sins-db instance. Its connection string lives in the secret
-- store, never in this repo.)

CREATE TABLE IF NOT EXISTS mesh_connector (
    id           VARCHAR(64)  PRIMARY KEY,          -- e.g. 'shopify.store'
    display_name VARCHAR(128) NOT NULL,
    platform     VARCHAR(32)  NOT NULL,             -- shopify | grok | vercel | ...
    category     VARCHAR(32)  NOT NULL,             -- commerce | ai | content | social
    direction    VARCHAR(16)  NOT NULL,             -- inbound|outbound|bidirectional
    auth_kind    VARCHAR(32)  NOT NULL,             -- oauth2|api_key|hmac|webhook
    secret_ref   VARCHAR(128) NOT NULL,             -- pointer ONLY, never the secret
    status       VARCHAR(16)  NOT NULL DEFAULT 'pending',
    release_tag  VARCHAR(8)   NOT NULL DEFAULT 'v1',
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT connector_status_chk
        CHECK (status IN ('pending','active','paused','error','retired')),
    CONSTRAINT connector_direction_chk
        CHECK (direction IN ('inbound','outbound','bidirectional'))
);

-- Interval table is the automation source of truth: schedulers read it,
-- never hardcode a cron string.
CREATE TABLE IF NOT EXISTS sync_interval (
    connector_id VARCHAR(64) PRIMARY KEY
                 REFERENCES mesh_connector(id) ON DELETE CASCADE,
    cron_expr    VARCHAR(64) NOT NULL,              -- standard 5-field crontab
    batch_size   INTEGER     NOT NULL DEFAULT 100  CHECK (batch_size BETWEEN 1 AND 5000),
    max_attempts SMALLINT    NOT NULL DEFAULT 5    CHECK (max_attempts BETWEEN 1 AND 20),
    backoff_secs INTEGER     NOT NULL DEFAULT 30   CHECK (backoff_secs > 0),
    enabled      BOOLEAN     NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS sync_batch (
    batch_id     BIGSERIAL PRIMARY KEY,
    connector_id VARCHAR(64) NOT NULL REFERENCES mesh_connector(id),
    state        VARCHAR(16) NOT NULL DEFAULT 'queued',
    cursor_in    VARCHAR(256),                      -- platform page/since token
    cursor_out   VARCHAR(256),
    records      INTEGER     NOT NULL DEFAULT 0,
    attempt      SMALLINT    NOT NULL DEFAULT 0,
    started_at   TIMESTAMPTZ,
    finished_at  TIMESTAMPTZ,
    error        TEXT,
    CONSTRAINT batch_state_chk
        CHECK (state IN ('queued','running','done','failed','skipped'))
);

CREATE INDEX IF NOT EXISTS sync_batch_conn_state_idx
    ON sync_batch (connector_id, state, started_at DESC);

-- Idempotency boundary for the whole mesh: a replayed delivery is a no-op.
CREATE TABLE IF NOT EXISTS input_mesh_event (
    event_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id     BIGINT      REFERENCES sync_batch(batch_id) ON DELETE SET NULL,
    connector_id VARCHAR(64) NOT NULL,
    dedupe_key   VARCHAR(128) NOT NULL,             -- platform id, or sha256(payload)
    payload      JSONB       NOT NULL,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (connector_id, dedupe_key)
);

-- 45-layer narrative registry (9 arcs x 5 depths, weights sum to 1.0000).
-- Seeded from src/mesh/narrative.ts — keep the two in sync.
CREATE TABLE IF NOT EXISTS narrative_layer (
    layer_no    SMALLINT    PRIMARY KEY CHECK (layer_no BETWEEN 1 AND 45),
    arc         VARCHAR(32) NOT NULL,
    depth       VARCHAR(16) NOT NULL,
    name        VARCHAR(64) NOT NULL,
    weight      NUMERIC(5,4) NOT NULL CHECK (weight > 0),
    release_tag VARCHAR(8)  NOT NULL DEFAULT 'v80'
);
