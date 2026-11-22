/**
 * mesh/narrative.ts — 45-layer narrative registry (v80 spec).
 *
 * 45 layers = 9 arcs x 5 depths. Each layer is a position, not a
 * sentence — the weight is its share of total voice. Weights are
 * normalised to sum to exactly 1.0000 so the mix stays auditable.
 * Mirrors the narrative_layer table in mesh/sql/001_mesh_v80.sql.
 */

const ARCS = [
  "Pride",
  "Greed",
  "Wrath",
  "Sloth",
  "Trace",
  "Reconcile",
  "Settle",
  "Reserve",
  "Seal",
] as const;

const DEPTHS = ["surface", "motion", "tension", "turn", "seal"] as const;

/** Relative pull of each depth, hook -> resolution. */
const DEPTH_PULL: Record<(typeof DEPTHS)[number], number> = {
  surface: 1.0,
  motion: 0.9,
  tension: 1.4,
  turn: 1.1,
  seal: 0.6,
};

export interface NarrativeLayer {
  layerNo: number;
  arc: string;
  depth: string;
  name: string;
  weight: number;
  releaseTag: "v80";
}

function buildLayers(): NarrativeLayer[] {
  const raw: Array<{ arc: string; depth: string; w: number }> = [];
  for (const arc of ARCS) {
    for (const depth of DEPTHS) {
      raw.push({ arc, depth, w: DEPTH_PULL[depth] });
    }
  }
  const total = raw.reduce((a, r) => a + r.w, 0);
  const layers: NarrativeLayer[] = raw.map((r, i) => ({
    layerNo: i + 1,
    arc: r.arc,
    depth: r.depth,
    name: `${r.arc.toLowerCase()}.${r.depth}`,
    weight: Math.round((r.w / total) * 10000) / 10000,
    releaseTag: "v80",
  }));

  // Absorb the rounding remainder into the heaviest layer so the sum
  // is exactly 1.0000.
  const sum = layers.reduce((a, l) => a + l.weight, 0);
  const delta = Math.round((1 - sum) * 10000) / 10000;
  if (delta !== 0) {
    const heaviest = layers.reduce((a, l) => (l.weight > a.weight ? l : a));
    heaviest.weight = Math.round((heaviest.weight + delta) * 10000) / 10000;
  }
  return layers;
}

export const NARRATIVE_LAYERS: NarrativeLayer[] = buildLayers();
