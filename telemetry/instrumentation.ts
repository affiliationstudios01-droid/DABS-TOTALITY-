/**
 * OpenTelemetry bootstrap — Affiliation Studios / DABS-TOTALITY-
 * Load BEFORE app imports (node --require ./dist/instrumentation.js)
 *
 * Version spine: v1 → v3 → v9 → v15 → v23 → v35 → v49 → v54 → v63 → v7 (ops air)
 * Protocol: INPUT → MESH → INTEGRATE → ACTIVATE → SYNC → EXECUTE
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

const serviceName = process.env.OTEL_SERVICE_NAME || 'dabs-totality';
const serviceVersion = process.env.OTEL_SERVICE_VERSION || 'v63-air';
const otlpEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion,
    'affiliation.mesh': 'input-mesh-integrate-activate-sync',
    'affiliation.air_ops': 'v1-v3-v9-v15-v23-v35-v49-v54-v63-v7',
  }),
  traceExporter: new OTLPTraceExporter({
    url: `${otlpEndpoint.replace(/\/$/, '')}/v1/traces`,
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${otlpEndpoint.replace(/\/$/, '')}/v1/metrics`,
    }),
    exportIntervalMillis: 30_000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => console.log('OTEL SDK shut down'))
    .catch((err) => console.error('OTEL shutdown error', err))
    .finally(() => process.exit(0));
});

export default sdk;
