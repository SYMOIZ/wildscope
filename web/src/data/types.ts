// Types for the static assets A-01..A-04 (contracts/*.schema.json are the source of truth).

export type Lens = "trees" | "animals";
export type BinId = "B00" | "B01" | "B02" | "B03" | "B04" | "B05" | "B06" | "B07" | "B08";
export type BinSel = BinId | "all";

export interface BinDef {
  id: BinId;
  label: string;
  tick: string;
  from: number;
  to: number | null;
}

export interface GroupDef {
  id: string;
  label: string;
  index: number;
  classes?: string[];
  note?: string | null;
}

export interface CellAsset {
  sha256: string;
  bytes: number;
  brotliBytes: number;
  cells: number;
}

export interface Manifest {
  schemaVersion: number;
  datasetId: string;
  snapshot: { id: string; source: string; registryUrl: string; parts: number; bytes: number; citation: string | null };
  retrievedAt: string;
  build: {
    kind: "full" | "sample" | "country";
    partsRead: number;
    partsTotal: number;
    sampleEvery: number;
    country: string | null;
    lensesBuilt: Lens[];
    resolutions: number[];
    tools: Record<string, string>;
  };
  constants: { MIN_EFFORT: number; MIN_SPECIES_RECORDS: number; MAX_UNCERTAINTY_M: number; MIN_YEAR: number };
  bins: BinDef[];
  lenses: {
    animals: { built: boolean; groupsVersion: number; groups: GroupDef[]; totalsByBin: Record<string, number[]> };
    trees: { built: boolean; reason?: string; groups?: GroupDef[]; totalsByBin?: Record<string, number[]> };
  };
  filters: {
    rowsRead: number;
    kept: number;
    stages: { id: string; rule: string; dropped: number }[];
    basisDropped: Record<string, number>;
    keptWithNullUncertainty: number;
    geospatialIssueFlags: string[];
    notApplied: string[];
  };
  species: { count: number; namesSource: string; searchPrefixes: string[]; sensitive: string[]; conservationSource: string | null };
  assets: { cells: Record<string, CellAsset>; speciesSha256: string; searchSha256: string };
  sizeReport: Record<string, number | boolean>;
  attribution: string[];
}

export interface SpeciesDoc {
  schemaVersion: number;
  speciesKey: string;
  scientificName: string;
  canonicalName: string;
  rank: string | null;
  taxonomicStatus: string | null;
  vernacularNames: { name: string; lang: string | null }[];
  vernacularNamesTotal: number;
  lens: Lens;
  group: string;
  taxonomy: Record<"kingdom" | "phylum" | "class" | "order" | "family" | "genus", string | null>;
  conservation: { category: string | null; source: string | null; assessmentYear: number | null };
  sensitive: boolean;
  records: {
    total: number;
    earliestYear: number;
    latestYear: number;
    byBin: number[];
    licence: Record<string, number>;
    topCountries: [string, number][];
  };
  cells: { res: 4; cells: [string, number[]][] };
  taxonUrl: string;
}

/** [speciesKey, scientificName, vernacularNames, lens, group, records] */
export type SearchEntry = [string, string, string[], Lens, string, number];

/** Decoded WSC1 density file: H3 ids (hex) and nine bin counts per cell. */
export interface DensityFile {
  res: number;
  groupIndex: number;
  ids: string[];
  counts: Uint32Array; // cell-major, 9 per cell
  index: Map<string, number>;
}
