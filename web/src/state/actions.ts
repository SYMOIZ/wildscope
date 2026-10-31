import { latLngToCell, cellToLatLng } from "h3-js";
import * as K from "../config/interaction";
import { loadSpecies } from "../data/assets";
import type { SpeciesDoc } from "../data/types";
import { globeApi } from "../globe/Globe";
import { useStore } from "./store";

function quantile(sorted: { v: number; w: number }[], q: number): number {
  const total = sorted.reduce((a, b) => a + b.w, 0);
  let acc = 0;
  for (const s of sorted) {
    acc += s.w;
    if (acc >= q * total) return s.v;
  }
  return sorted[sorted.length - 1].v;
}

/**
 * Record-extent target (INTERACTION §6): central 98% of record positions by weighted quantiles of
 * r4 cell centres. Longitudes are unwrapped when that gives a narrower span (antimeridian).
 */
export function flyToSpecies(sp: SpeciesDoc) {
  const pts = sp.cells.cells.map(([id, counts]) => {
    const [lat, lon] = cellToLatLng(id);
    return { lat, lon, w: counts.reduce((a, b) => a + b, 0) };
  });
  if (!pts.length) return;
  if (pts.length < K.MIN_CELLS_FOR_FIT) {
    const w = pts.reduce((a, p) => a + p.w, 0);
    globeApi.flyToPoint(pts.reduce((a, p) => a + p.lat * p.w, 0) / w, pts.reduce((a, p) => a + p.lon * p.w, 0) / w, K.FEW_CELLS_HEIGHT_M);
    return;
  }
  const q = K.EXTENT_QUANTILE;
  const lats = pts.map((p) => ({ v: p.lat, w: p.w })).sort((a, b) => a.v - b.v);
  const span = (lon: (p: (typeof pts)[0]) => number) => {
    const s = pts.map((p) => ({ v: lon(p), w: p.w })).sort((a, b) => a.v - b.v);
    return [quantile(s, q), quantile(s, 1 - q)];
  };
  let [w, e] = span((p) => p.lon);
  const [w2, e2] = span((p) => (p.lon < 0 ? p.lon + 360 : p.lon));
  if (e2 - w2 < e - w) {
    [w, e] = [w2 > 180 ? w2 - 360 : w2, e2 > 180 ? e2 - 360 : e2];
    if (e < w) [w, e] = [-180, 180]; // spans the antimeridian; show the whole width
  }
  const s = quantile(lats, q), n = quantile(lats, 1 - q);
  if (e - w < 1 && n - s < 1) {
    globeApi.flyToPoint((s + n) / 2, (w + e) / 2, K.FEW_CELLS_HEIGHT_M);
  } else {
    globeApi.flyToBounds(w, s, e, n);
  }
}

export async function selectSpecies(key: string, opts: { fly?: boolean } = {}) {
  const st = useStore.getState();
  if (!st.manifest) return;
  st.set({ loading: st.loading + 1 });
  try {
    const sp = await loadSpecies(st.manifest.datasetId, key);
    const s = useStore.getState();
    const patch: Parameters<typeof s.set>[0] = { speciesKey: key, species: sp, panel: "species", selectedCell: null };
    if (sp.lens !== s.lens) Object.assign(patch, { lens: sp.lens, group: "all" });
    else if (s.group !== "all" && s.group !== sp.group) patch.group = "all";
    s.set(patch);
    if (opts.fly !== false) flyToSpecies(sp);
  } catch {
    useStore.getState().toast("Could not load the species file.", "error", { label: "Retry", run: () => void selectSpecies(key, opts) });
  } finally {
    useStore.getState().set({ loading: Math.max(0, useStore.getState().loading - 1) });
  }
}

export interface Place {
  id: string;
  label: string;
  type: string;
  lat: number;
  lon: number;
  bounds: { west: number; south: number; east: number; north: number } | null;
  countryCode: string | null;
}

/** S08: fly to the place and select the cell under it at the current LOD. */
export function selectPlace(p: Place) {
  const s = useStore.getState();
  if (p.bounds && p.bounds.east > p.bounds.west && p.bounds.north > p.bounds.south) {
    globeApi.flyToBounds(p.bounds.west, p.bounds.south, p.bounds.east, p.bounds.north);
  } else {
    globeApi.flyToPoint(p.lat, p.lon);
  }
  const res = 4; // after fly-to the camera is below the L0 threshold for most places
  s.set({ pin: { lat: p.lat, lon: p.lon, label: p.label }, selectedCell: { id: latLngToCell(p.lat, p.lon, res), res }, panel: "cell" });
}
