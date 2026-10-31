import { splitLongToH3Index } from "h3-js";
import type { DensityFile, Manifest, SearchEntry, SpeciesDoc } from "./types";

const DATA_ROOT = "/data/v1";
const SUPPORTED_SCHEMA = 1;

export class AssetError extends Error {
  constructor(public what: string, message: string) {
    super(message);
  }
}

async function fetchWithRetry(url: string, what: string, tries = 3): Promise<Response> {
  let delay = 2000;
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return r;
      if (r.status === 404 || i >= tries - 1) throw new AssetError(what, `HTTP ${r.status}`);
    } catch (e) {
      if (e instanceof AssetError || i >= tries - 1) throw e instanceof AssetError ? e : new AssetError(what, String(e));
    }
    await new Promise((res) => setTimeout(res, delay));
    delay *= 2;
  }
}

export interface DatasetRef {
  datasetId: string;
  path: string;
}

export async function loadLatest(): Promise<DatasetRef> {
  const r = await fetchWithRetry(`${DATA_ROOT}/latest.json`, "the data index");
  return r.json();
}

export function datasetPath(datasetId: string): string {
  return `${DATA_ROOT}/${datasetId}/`;
}

export async function loadManifest(datasetId: string): Promise<Manifest> {
  const r = await fetchWithRetry(datasetPath(datasetId) + "manifest.json", "the data manifest");
  const m: Manifest = await r.json();
  if (m.schemaVersion !== SUPPORTED_SCHEMA) throw new AssetError("the data manifest", `unsupported schemaVersion ${m.schemaVersion}`);
  return m;
}

/** Decode a WSC1 density file (DATA_ARCHITECTURE §8) and validate magic, version and length. */
export function decodeWsc1(buf: ArrayBuffer): DensityFile {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== "WSC1" || dv.getUint8(4) !== 1) throw new Error("not a WSC1 v1 file");
  const res = dv.getUint8(5);
  const groupIndex = dv.getUint16(6, true);
  const n = dv.getUint32(8, true);
  if (buf.byteLength !== 12 + n * 44) throw new Error("WSC1 length mismatch");
  const hi = new Uint32Array(buf, 12, n);
  const lo = new Uint32Array(buf, 12 + 4 * n, n);
  const counts = new Uint32Array(buf, 12 + 8 * n, n * 9);
  const ids: string[] = new Array(n);
  const index = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    ids[i] = splitLongToH3Index(lo[i], hi[i]);
    index.set(ids[i], i);
  }
  return { res, groupIndex, ids, counts, index };
}

const densityCache = new Map<string, Promise<DensityFile>>();

export function loadDensity(datasetId: string, lens: string, group: string, res: number): Promise<DensityFile> {
  const key = `${datasetId}/${lens}/${group}/${res}`;
  let p = densityCache.get(key);
  if (!p) {
    p = fetchWithRetry(`${datasetPath(datasetId)}cells/${lens}/${group}/r${res}.bin`, "the record density layer")
      .then((r) => r.arrayBuffer())
      .then(decodeWsc1);
    p.catch(() => densityCache.delete(key));
    densityCache.set(key, p);
  }
  return p;
}

const speciesCache = new Map<string, Promise<SpeciesDoc>>();

export function loadSpecies(datasetId: string, key: string): Promise<SpeciesDoc> {
  let p = speciesCache.get(key);
  if (!p) {
    p = fetchWithRetry(`${datasetPath(datasetId)}species/${key}.json`, "the species file").then((r) => r.json());
    p.catch(() => speciesCache.delete(key));
    speciesCache.set(key, p);
  }
  return p;
}

const searchCache = new Map<string, Promise<SearchEntry[]>>();

export function loadSearchShard(datasetId: string, prefix: string): Promise<SearchEntry[]> {
  let p = searchCache.get(prefix);
  if (!p) {
    p = fetchWithRetry(`${datasetPath(datasetId)}search/${prefix}.json`, "the species index").then((r) => r.json());
    p.catch(() => searchCache.delete(prefix));
    searchCache.set(prefix, p);
  }
  return p;
}

export interface AppConfig {
  apiBase: string;
  locationApiKey: string | null;
  locationRegion: string;
  placesAttribution: string;
}

export async function loadConfig(): Promise<AppConfig> {
  const defaults: AppConfig = {
    apiBase: "/api/v1",
    locationApiKey: null,
    locationRegion: "us-east-1",
    placesAttribution: "Place search: Amazon Location Service",
  };
  try {
    const r = await fetch("/config.json", { cache: "no-store" });
    if (!r.ok) return defaults;
    return { ...defaults, ...(await r.json()) };
  } catch {
    return defaults;
  }
}
