import { cellToParent } from "h3-js";
import { loadDensity } from "../data/assets";
import type { BinSel, DensityFile, Lens, Manifest, SpeciesDoc } from "../data/types";
import type { Lod } from "../state/store";
import { classOf, computeBreaks, RAMPS } from "./ramps";
import type { CellValues } from "./cellLayer";

/** What a cell under the pointer shows. `effort` is null when the layer has no effort context. */
export interface CellInfo {
  records: number;
  effort: number | null;
  value: number;
  hatched: boolean;
}

export type LayerKind = "density" | "density-normalised" | "species" | "species-effort" | "species-normalised";

export interface Layer {
  key: string;
  kind: LayerKind;
  res: number;
  lod: Lod;
  draw: CellValues;
  info: Map<string, CellInfo>;
  breaks: number[];
  isShare: boolean;
  empty: boolean;
  /** Per-bin effort (records of the active lens/group) for the effort strip; source A-02 / A-01. */
  effortByBin: number[];
}

export interface LayerParams {
  manifest: Manifest;
  lens: Lens;
  group: string;
  bin: BinSel;
  lod: Lod;
  normalised: boolean;
  mode: "density" | "effort";
  species: SpeciesDoc | null;
}

export function layerKey(p: LayerParams): string {
  return [p.manifest.datasetId, p.lens, p.group, p.bin, p.lod, p.normalised ? 1 : 0, p.mode, p.species?.speciesKey ?? "-"].join("|");
}

function binValue(counts: Uint32Array | number[], offset: number, bin: BinSel, binIndex: number): number {
  if (bin !== "all") return counts[offset + binIndex];
  let s = 0;
  for (let b = 0; b < 9; b++) s += counts[offset + b];
  return s;
}

function effortOf(f: DensityFile, id: string, bin: BinSel, bi: number): number {
  const i = f.index.get(id);
  return i === undefined ? 0 : binValue(f.counts, i * 9, bin, bi);
}

/** Whether effort-normalised mode is meaningful for the current selection, and if not, why. */
export function normalisedAvailability(group: string, species: SpeciesDoc | null): { ok: boolean; reason?: string } {
  if (species) return { ok: true };
  if (group !== "all") return { ok: true };
  return { ok: false, reason: "Pick a group or a species: the share of all records needs a subset to compare." };
}

export async function buildLayer(p: LayerParams): Promise<Layer> {
  const res = p.lod === 0 ? 2 : 4;
  const bi = p.bin === "all" ? -1 : Number(p.bin.slice(1));
  const minEffort = p.manifest.constants.MIN_EFFORT;
  const ds = p.manifest.datasetId;
  const totals = p.manifest.lenses[p.lens].totalsByBin ?? {};
  const effortByBin = totals[p.group] ?? new Array(9).fill(0);
  const ramp = RAMPS[p.lens];
  const info = new Map<string, CellInfo>();

  const normOk = p.normalised && normalisedAvailability(p.group, p.species).ok;
  let kind: LayerKind;

  if (!p.species) {
    const f = await loadDensity(ds, p.lens, p.group, res);
    const effortFile = normOk ? await loadDensity(ds, p.lens, "all", res) : null;
    kind = normOk ? "density-normalised" : "density";
    for (let i = 0; i < f.ids.length; i++) {
      const n = binValue(f.counts, i * 9, p.bin, bi);
      if (!n) continue;
      if (effortFile) {
        const e = effortOf(effortFile, f.ids[i], p.bin, bi);
        info.set(f.ids[i], { records: n, effort: e, value: e ? n / e : 0, hatched: e < minEffort });
      } else {
        info.set(f.ids[i], { records: n, effort: null, value: n, hatched: false });
      }
    }
  } else {
    const effortFile = await loadDensity(ds, p.lens, p.group, res);
    // Species cells are stored at res 4; L0 aggregates them to their res-2 parents.
    const sp = new Map<string, number>();
    for (const [id, counts] of p.species.cells.cells) {
      const n = binValue(counts, 0, p.bin, bi);
      if (!n) continue;
      const cid = res === 4 ? id : cellToParent(id, res);
      sp.set(cid, (sp.get(cid) ?? 0) + n);
    }
    if (p.mode === "effort") {
      kind = "species-effort";
      for (let i = 0; i < effortFile.ids.length; i++) {
        const e = binValue(effortFile.counts, i * 9, p.bin, bi);
        if (!e) continue;
        const id = effortFile.ids[i];
        info.set(id, { records: sp.get(id) ?? 0, effort: e, value: e, hatched: false });
      }
    } else {
      kind = normOk ? "species-normalised" : "species";
      for (const [id, n] of sp) {
        const e = effortOf(effortFile, id, p.bin, bi);
        info.set(id, normOk ? { records: n, effort: e, value: e ? n / e : 0, hatched: e < minEffort } : { records: n, effort: e, value: n, hatched: false });
      }
    }
  }

  const ids = [...info.keys()];
  const breaks = computeBreaks(ids.filter((id) => !info.get(id)!.hatched).map((id) => info.get(id)!.value));
  const colors = ids.map((id) => {
    const c = info.get(id)!;
    return c.hatched ? "" : ramp[classOf(c.value, breaks)];
  });
  return {
    key: layerKey(p),
    kind,
    res,
    lod: p.lod,
    draw: { ids, colors, hatched: ids.map((id) => info.get(id)!.hatched), style: p.lod === 2 ? "outline" : p.lod === 1 ? "fill-edged" : "fill" },
    info,
    breaks,
    isShare: kind === "density-normalised" || kind === "species-normalised",
    empty: ids.length === 0,
    effortByBin,
  };
}
