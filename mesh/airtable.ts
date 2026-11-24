/**
 * Airtable mesh node — Affiliation Studios
 * INPUT → MESH → INTEGRATE → ACTIVATE → SYNC
 *
 * Env:
 *   AIRTABLE_API_KEY   (pat...)
 *   AIRTABLE_BASE_ID   (app...)
 *   AIRTABLE_TABLE     (default: Ops Ledger)
 */

import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('affiliation.airtable', 'v7');

const API_KEY = process.env.AIRTABLE_API_KEY || '';
const BASE_ID = process.env.AIRTABLE_BASE_ID || '';
const TABLE = process.env.AIRTABLE_TABLE || 'Ops Ledger';

export type AirRow = Record<string, string | number | boolean | null>;

function baseUrl(): string {
  if (!BASE_ID) throw new Error('AIRTABLE_BASE_ID is not set');
  return `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`;
}

function headers(): HeadersInit {
  if (!API_KEY) throw new Error('AIRTABLE_API_KEY is not set');
  return {
    Authorization: `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  };
}

/** SYNC: upsert a row into Airtable (idempotent on external_id) */
export async function syncToAirtable(
  fields: AirRow,
  opts?: { externalIdField?: string }
): Promise<{ id: string; fields: AirRow }> {
  return tracer.startActiveSpan('airtable.sync', async (span) => {
    span.setAttribute('airtable.base', BASE_ID);
    span.setAttribute('airtable.table', TABLE);
    try {
      const externalField = opts?.externalIdField ?? 'external_id';
      if (externalField && fields[externalField] != null) {
        // Look up existing by formula
        const formula = `{${externalField}}='${String(fields[externalField]).replace(/'/g, "\\'")}'`;
        const listUrl = `${baseUrl()}?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
        const listRes = await fetch(listUrl, { headers: headers() });
        if (!listRes.ok) {
          throw new Error(`Airtable list failed: ${listRes.status} ${await listRes.text()}`);
        }
        const listJson = (await listRes.json()) as { records: { id: string }[] };
        if (listJson.records?.length) {
          const id = listJson.records[0].id;
          const patchRes = await fetch(`${baseUrl()}/${id}`, {
            method: 'PATCH',
            headers: headers(),
            body: JSON.stringify({ fields }),
          });
          if (!patchRes.ok) {
            throw new Error(`Airtable patch failed: ${patchRes.status} ${await patchRes.text()}`);
          }
          const patched = (await patchRes.json()) as { id: string; fields: AirRow };
          span.setStatus({ code: SpanStatusCode.OK });
          return { id: patched.id, fields: patched.fields };
        }
      }

      const createRes = await fetch(baseUrl(), {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ records: [{ fields }], typecast: true }),
      });
      if (!createRes.ok) {
        throw new Error(`Airtable create failed: ${createRes.status} ${await createRes.text()}`);
      }
      const created = (await createRes.json()) as {
        records: { id: string; fields: AirRow }[];
      };
      span.setStatus({ code: SpanStatusCode.OK });
      return { id: created.records[0].id, fields: created.records[0].fields };
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    } finally {
      span.end();
    }
  });
}

/** INTEGRATE: map a ledger split line into Airtable fields */
export function ledgerLineToAirFields(line: {
  source_system: string;
  source_event_id: string;
  bucket_code: string;
  amount_cents: number;
  net_cents: number;
  occurred_at?: string;
}): AirRow {
  return {
    external_id: `${line.source_system}:${line.source_event_id}:${line.bucket_code}`,
    source_system: line.source_system,
    source_event_id: line.source_event_id,
    bucket_code: line.bucket_code,
    amount_usd: line.amount_cents / 100,
    net_usd: line.net_cents / 100,
    occurred_at: line.occurred_at || new Date().toISOString(),
    mesh_version: 'v63-air',
  };
}
