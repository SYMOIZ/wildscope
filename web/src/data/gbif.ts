import SparkMD5 from "spark-md5";
import type { BinDef, BinSel, GroupDef } from "./types";

// Live GBIF occurrence API (api.gbif.org, CORS-enabled). Used for the local zoom level, record cards,
// species photos and IUCN categories. Filters mirror the snapshot build (DATA_ARCHITECTURE §3) so the
// live layer shows the same kind of records the aggregates count; counts from here are labelled LIVE and
// never mixed with snapshot counts.

export const GBIF_API = "https://api.gbif.org/v1";
export const LIVE_PAGE = 300;

/** GBIF Backbone taxon keys per animal group (verified against api.gbif.org/v1/species/{key}, 2026-10-31). */
export const GROUP_TAXON_KEYS: Record<string, number[] | null> = {
  all: [1], // Animalia
  mammals: [359],
  birds: [212],
  reptiles: [11592253, 11418114, 11493978], // Squamata, Testudines, Crocodylia (Reptilia is not a backbone class)
  amphibians: [131],
  fishes: [204, 121, 120, 238, 119, 11881065], // Actinopterygii, Elasmobranchii, Holocephali, Sarcopterygii, Myxini, Petromyzonti
  insects: [216],
  other_invertebrates: null, // no single key: request Animalia and drop the classes of the other groups client-side
};

const BASE_FILTERS: [string, string][] = [
  ["hasCoordinate", "true"],
  ["hasGeospatialIssue", "false"],
  ["occurrenceStatus", "PRESENT"],
  ["license", "CC0_1_0"],
  ["license", "CC_BY_4_0"],
  ["basisOfRecord", "HUMAN_OBSERVATION"],
  ["basisOfRecord", "OBSERVATION"],
  ["basisOfRecord", "PRESERVED_SPECIMEN"],
  ["basisOfRecord", "MACHINE_OBSERVATION"],
];

/** F8 in the build keeps records with unknown uncertainty or at most 10 km. GBIF interval filters drop records
 * without a value (most observations in many regions), so the API is queried without it; records stating more
 * than 10 km are removed client-side and subtracted from totals using this interval. */
export const MAX_UNCERTAINTY_M = 10_000;
const OVER_MAX_UNCERTAINTY = `${MAX_UNCERTAINTY_M + 0.001},*`;

export interface Bbox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface LiveQuery {
  bbox: Bbox;
  group: string;
  bin: BinSel;
  bins: BinDef[];
  taxonKey?: number | null; // species mode: GBIF backbone usage key
}

export function liveParams(q: LiveQuery): URLSearchParams {
  const p = new URLSearchParams(BASE_FILTERS);
  const f = (x: number) => x.toFixed(4);
  p.set("decimalLatitude", `${f(Math.max(-90, q.bbox.south))},${f(Math.min(90, q.bbox.north))}`);
  p.set("decimalLongitude", `${f(Math.max(-180, q.bbox.west))},${f(Math.min(180, q.bbox.east))}`);
  if (q.taxonKey) {
    p.append("taxonKey", String(q.taxonKey));
  } else {
    for (const k of GROUP_TAXON_KEYS[q.group] ?? [1]) p.append("taxonKey", String(k));
  }
  if (q.bin !== "all") {
    const b = q.bins.find((x) => x.id === q.bin);
    if (b) p.set("year", `${b.id === "B00" ? 1700 : b.from},${b.to ?? new Date().getUTCFullYear()}`);
  }
  return p;
}

export type LicenceLabel = "CC0" | "CC BY 4.0" | "CC BY" | "CC BY-SA" | null;

/** Normalise GBIF licence strings (enum or URL). Returns null for anything WildScope must not display. */
export function licenceLabel(raw: string | null | undefined): LicenceLabel {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s === "cc0_1_0" || s.includes("publicdomain/zero")) return "CC0";
  if (s === "cc_by_4_0" || /licenses\/by\/4\.0/.test(s)) return "CC BY 4.0";
  if (/licenses\/by\/\d/.test(s)) return "CC BY";
  if (/licenses\/by-sa\//.test(s)) return "CC BY-SA";
  return null; // NC, ND, all rights reserved, unknown
}

export interface Photo {
  thumb: string;
  large: string;
  creator: string | null;
  licence: Exclude<LicenceLabel, null>;
  source: string | null;
}

export interface LiveRecord {
  key: number;
  lat: number;
  lon: number;
  uncertaintyM: number | null;
  species: string | null;
  scientificName: string | null;
  speciesKey: number | null;
  className: string | null;
  eventDate: string | null;
  year: number | null;
  basis: string;
  licence: LicenceLabel;
  dataset: string | null;
  recordedBy: string | null;
  country: string | null;
  locality: string | null;
  iucn: string | null;
  establishmentMeans: string | null;
  photos: Photo[];
}

interface ApiMedia {
  type?: string;
  identifier?: string;
  license?: string;
  creator?: string;
  rightsHolder?: string;
  publisher?: string;
}

/** Photos via GBIF's image cache (one trusted image host), only with a licence WildScope may show. */
export function photosOf(key: number, media: ApiMedia[] | undefined): Photo[] {
  const out: Photo[] = [];
  for (const m of media ?? []) {
    if (m.type !== "StillImage" || !m.identifier) continue;
    const licence = licenceLabel(m.license);
    if (!licence) continue;
    const md5 = SparkMD5.hash(m.identifier);
    out.push({
      thumb: `${GBIF_API}/image/cache/200x/occurrence/${key}/media/${md5}`,
      large: `${GBIF_API}/image/cache/fit-in/800x600/occurrence/${key}/media/${md5}`,
      creator: m.creator ?? m.rightsHolder ?? null,
      licence,
      source: m.publisher ?? null,
    });
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toRecord(r: any): LiveRecord | null {
  if (typeof r.decimalLatitude !== "number" || typeof r.decimalLongitude !== "number") return null;
  return {
    key: r.key,
    lat: r.decimalLatitude,
    lon: r.decimalLongitude,
    uncertaintyM: typeof r.coordinateUncertaintyInMeters === "number" ? r.coordinateUncertaintyInMeters : null,
    species: r.species ?? null,
    scientificName: r.scientificName ?? null,
    speciesKey: r.speciesKey ?? null,
    className: r.class ?? null,
    eventDate: typeof r.eventDate === "string" ? r.eventDate : null,
    year: r.year ?? null,
    basis: r.basisOfRecord,
    licence: licenceLabel(r.license),
    dataset: r.datasetName ?? null,
    recordedBy: r.recordedBy ?? null,
    country: r.countryCode ?? null,
    locality: r.locality ?? null,
    iucn: r.iucnRedListCategory ?? null,
    establishmentMeans: r.establishmentMeans ?? null,
    photos: photosOf(r.key, r.media),
  };
}

/** Group of a live record by its class name, using the manifest's group definitions. */
export function groupOfClass(className: string | null, groups: GroupDef[]): string {
  for (const g of groups) if (g.classes?.includes(className ?? "")) return g.id;
  return "other_invertebrates";
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`GBIF API ${r.status}`);
  return r.json();
}

export interface LiveResult {
  count: number; // all matching records in view (GBIF's total)
  records: LiveRecord[]; // the page shown, at most LIVE_PAGE
  fetchedAt: string;
}

async function countOverMaxUncertainty(q: LiveQuery, signal?: AbortSignal): Promise<number> {
  const p = liveParams(q);
  p.set("limit", "0");
  p.set("coordinateUncertaintyInMeters", OVER_MAX_UNCERTAINTY);
  return (await getJson<{ count: number }>(`${GBIF_API}/occurrence/search?${p}`, signal)).count;
}

export async function fetchRecordsInView(q: LiveQuery, groups: GroupDef[], signal?: AbortSignal): Promise<LiveResult> {
  const p = liveParams(q);
  p.set("limit", String(LIVE_PAGE));
  const [body, over] = await Promise.all([
    getJson<{ count: number; results: unknown[] }>(`${GBIF_API}/occurrence/search?${p}`, signal),
    countOverMaxUncertainty(q, signal),
  ]);
  let records = body.results
    .map(toRecord)
    .filter((x): x is LiveRecord => !!x && (x.uncertaintyM === null || x.uncertaintyM <= MAX_UNCERTAINTY_M));
  if (q.group === "other_invertebrates" && !q.taxonKey) {
    records = records.filter((r) => groupOfClass(r.className, groups) === "other_invertebrates");
  }
  return { count: Math.max(0, body.count - over), records, fetchedAt: new Date().toISOString() };
}

export interface Facet {
  name: string;
  count: number;
}

export interface ViewFacets {
  count: number; // records in view after the 10 km rule
  /** Records stating more than 10 km uncertainty: excluded from count, still inside the facet counts. */
  overMaxUncertainty: number;
  species: Facet[];
  iucn: Facet[];
  classes: Facet[];
}

export async function fetchViewFacets(q: LiveQuery, signal?: AbortSignal): Promise<ViewFacets> {
  const p = liveParams(q);
  p.set("limit", "0");
  for (const f of ["speciesKey", "iucnRedListCategory", "classKey"]) p.append("facet", f);
  p.set("facetLimit", "10");
  const [body, over] = await Promise.all([
    getJson<{ count: number; facets: { field: string; counts: Facet[] }[] }>(`${GBIF_API}/occurrence/search?${p}`, signal),
    countOverMaxUncertainty(q, signal),
  ]);
  const get = (field: string) => body.facets.find((f) => f.field === field)?.counts ?? [];
  return { count: Math.max(0, body.count - over), overMaxUncertainty: over, species: get("SPECIES_KEY"), iucn: get("IUCN_RED_LIST_CATEGORY"), classes: get("CLASS_KEY") };
}

const taxonCache = new Map<number, Promise<{ name: string; vernacular: string | null; rank: string }>>();

export function taxonName(key: number): Promise<{ name: string; vernacular: string | null; rank: string }> {
  let p = taxonCache.get(key);
  if (!p) {
    p = getJson<{ canonicalName?: string; scientificName: string; vernacularName?: string; rank: string }>(`${GBIF_API}/species/${key}`).then((d) => ({
      name: d.canonicalName ?? d.scientificName,
      vernacular: d.vernacularName ?? null,
      rank: d.rank,
    }));
    p.catch(() => taxonCache.delete(key));
    taxonCache.set(key, p);
  }
  return p;
}

const matchCache = new Map<string, Promise<number | null>>();

/** GBIF Backbone usage key for a canonical species name (snapshot keys are Catalogue of Life ids). */
export function matchSpecies(canonical: string, className?: string | null): Promise<number | null> {
  let p = matchCache.get(canonical);
  if (!p) {
    const q = new URLSearchParams({ name: canonical, rank: "SPECIES", strict: "true", kingdom: "Animalia" });
    if (className) q.set("class", className);
    p = getJson<{ usageKey?: number; matchType: string; rank?: string }>(`${GBIF_API}/species/match?${q}`).then((d) =>
      d.usageKey && d.matchType === "EXACT" && d.rank === "SPECIES" ? d.usageKey : null,
    );
    p.catch(() => matchCache.delete(canonical));
    matchCache.set(canonical, p);
  }
  return p;
}

export interface Conservation {
  code: string;
  category: string;
}

/** IUCN Red List category as published through GBIF (no assessment year is provided by this source). */
export async function fetchIucn(usageKey: number): Promise<Conservation | null> {
  try {
    const d = await getJson<{ code?: string; category?: string }>(`${GBIF_API}/species/${usageKey}/iucnRedListCategory`);
    return d.code && d.category ? { code: d.code, category: d.category } : null;
  } catch {
    return null; // 404 when the species has no category in GBIF
  }
}

/** Up to `n` photographs for a species from licensed records. */
export async function fetchSpeciesPhotos(usageKey: number, n = 6): Promise<{ photos: (Photo & { recordKey: number; date: string | null; country: string | null })[] }> {
  const p = new URLSearchParams(BASE_FILTERS);
  p.set("taxonKey", String(usageKey));
  p.set("mediaType", "StillImage");
  p.set("limit", "30");
  const body = await getJson<{ results: unknown[] }>(`${GBIF_API}/occurrence/search?${p}`);
  const photos: (Photo & { recordKey: number; date: string | null; country: string | null })[] = [];
  for (const raw of body.results) {
    const r = toRecord(raw);
    if (!r || !r.photos.length) continue;
    photos.push({ ...r.photos[0], recordKey: r.key, date: r.eventDate, country: r.country });
    if (photos.length >= n) break;
  }
  return { photos };
}

/**
 * GBIF Maps API v2 "adhoc" tiles: every record matching the same filters as `liveParams`, drawn as density
 * dots (Web Mercator, 512 px). Used under the clickable records so the local level shows all records, not a page.
 */
export function densityTileUrl(q: Omit<LiveQuery, "bbox">): string {
  const p = liveParams({ ...q, bbox: { west: -180, south: -90, east: 180, north: 90 } });
  p.delete("decimalLatitude");
  p.delete("decimalLongitude");
  p.delete("hasCoordinate");
  p.set("srs", "EPSG:3857");
  p.set("mode", "GEO_CENTROID");
  p.set("style", "orangeHeat.point");
  return `https://api.gbif.org/v2/map/occurrence/adhoc/{z}/{x}/{y}@1x.png?${p.toString()}`;
}
