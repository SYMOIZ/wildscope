# WildScope — Data Architecture

All figures in this document that describe *external* datasets (sizes, counts, field names) are **to be verified against the live source during pipeline step 0**; the build fails if verification disagrees. No number from this document may appear in the UI: UI numbers come only from the build manifest (A-01).

## 1. Sources

| ID | Source | Used for | Access | Licence / terms | Status |
|---|---|---|---|---|---|
| SRC-1 | **GBIF occurrence snapshot** in the Registry of Open Data on AWS (Parquet; the bucket `gbif-open-data-us-east-1`, prefix `occurrence/<snapshot-date>/occurrence.parquet/` — a folder of single-row-group part files (verified 2026-10-31: snapshot `2026-10-01`, 10,448 parts, 303.0 GB); `citation.txt` sits next to it) | Recorded occurrences, taxonomy ranks, per-record licence, basis of record, uncertainty | Public S3, no account; best read from us-east-1 | Per-record: CC0, CC BY, CC BY-NC. WildScope uses CC0 and CC BY only. Citation required (GBIF.org, dataset DOI/snapshot id) | Core |
| SRC-2 | **IUCN Red List** (category per species, assessment year, assessing body) | Conservation classification; confirmed extinction (EX/EW) | Option A: category field carried in GBIF occurrence data (if present in the snapshot; no assessment year). Option B: IUCN Red List API (requires registering for a token; terms restrict use) | IUCN Terms of Use: attribution; bulk redistribution and commercial use restricted | UD-05 open |
| SRC-3 | **Tree species list** (defines what "Trees" means) | Trees lens membership | BGCI GlobalTreeSearch (permission/terms to confirm) or a curated list with citations | To confirm | UD-04 open — highest data risk |
| SRC-4 | **Curated life-cycle and lifespan records** | S07 and lifespan block | Hand-curated from cited literature/databases, reviewed by a second person | Our own text; each citation's licence respected (we cite and summarise, never copy text) | P1; initial set size is a decision (UD-06) |
| SRC-5 | **Images** | S05 header image | GBIF/iNaturalist/Wikimedia per-image licence via API at request time | Allowed: CC0, CC BY, CC BY-SA (attribution mandatory, link to source). Excluded: NC, ND, all-rights-reserved | P1 |
| SRC-6 | **Amazon Location Service** | Place search (geocoding), reverse geocoding, basemap | AWS API | AWS service terms; billed per request | Core; basemap-in-Cesium compatibility is UD-02 |

Not available openly and therefore **not in the MVP**: expert range maps / estimated distributions (IUCN spatial data requires an application and has non-commercial limits; BirdLife and others similar), comprehensive life-history traits across all species.

## 2. Snapshot policy

- Exactly one GBIF snapshot per release. Snapshot id = the dated folder name (e.g. `2026-10-01`; use the newest available at build time).
- All outputs are written under `/data/v1/<snapshot>/…`. Old snapshots remain until the next release is verified, enabling share-URL stability (`snap=` parameter, INTERACTION §10).
- The manifest (A-01) states snapshot id, retrieval date, row counts at each filter stage, hashes of outputs, tool versions.

## 3. Quality filters (applied in this order; every stage's drop count is recorded)

Field names are as in the GBIF Parquet schema and must be verified in step 0.

| # | Filter | Rule | Rationale |
|---|---|---|---|
| F1 | Has coordinates | `decimallatitude`/`decimallongitude` not null, latitude ∈ [−90, 90], longitude ∈ [−180, 180], not (0, 0). (The AWS snapshot has no `hascoordinate` column — verified in step 0) | Needed to place a cell |
| F2 | Geospatial issues | `issue` array contains none of `ZERO_COORDINATE`, `COORDINATE_INVALID`, `COORDINATE_OUT_OF_RANGE`, `COUNTRY_COORDINATE_MISMATCH` (GBIF's definition of `hasGeospatialIssues`; the snapshot has no such boolean column) | Removes country–coordinate mismatches, zero/invalid coordinates, etc. |
| F3 | Presence | `occurrencestatus = 'PRESENT'`; null status is excluded by default (UD-15) | Absence records exist in GBIF |
| F4 | Basis of record | in (`HUMAN_OBSERVATION`, `OBSERVATION`, `PRESERVED_SPECIMEN`, `MACHINE_OBSERVATION`) | Excludes `FOSSIL_SPECIMEN`, `LIVING_SPECIMEN` (zoos, botanic gardens), and unknown |
| F5 | Licence | `license` in (`CC0_1_0`, `CC_BY_4_0`) | Compatible with redistribution of derived counts |
| F6 | Taxon resolved to species | `specieskey` not null; subspecies/varieties roll up to `specieskey`. In snapshot 2026-10-01 `specieskey` is a string holding Catalogue of Life eXtended Release ids (e.g. `93Q3Q`), not numeric GBIF Backbone keys | One map per species |
| F7 | Year | `year` not null and 1700 ≤ year ≤ snapshot year | Binning; earlier/undated records excluded and counted |
| F8 | Coordinate uncertainty | r2, r4 aggregates: null or `coordinateuncertaintyinmeters` ≤ 10,000 m. r6 aggregates: null or ≤ 2,000 m. Null counted separately | Prevents mis-binning at fine cells (res-6 edge ≈ 3.2 km) |
| F9 | Kingdom | Animals: `kingdom = 'Animalia'`. Trees: `kingdom = 'Plantae'` AND `specieskey` in the tree list (SRC-3) | Lens definitions |
| F10 | Sensitive flag | not a drop: flags species (see §9) | FR-22 |

Not done in MVP (documented limitation): duplicate-record removal across publishers, taxonomic-name reconciliation beyond the GBIF backbone, outlier detection beyond GBIF's own flags.

## 4. H3 grid

| LOD | H3 resolution | Average cell area (H3 documentation) | Used when |
|---|---|---|---|
| L0 | 2 | ≈ 86,800 km² | camera height ≥ 8,000 km |
| L1 | 4 | ≈ 1,770 km² | 2,000–8,000 km |
| L2 | 6 | ≈ 36 km² | < 2,000 km (where species/shard exists) |

Cell ids are 64-bit H3 indices stored as two `uint32` (hi, lo) in binary assets and as hex strings in JSON. Records are assigned using the record's point; no spreading of uncertainty.

Region summary cell: at L1 and L2 the region summary describes the **res-4 parent cell** of the clicked cell and says so ("Area of about 1,770 km²").

## 5. Groups

### 5.1 Animals (lens `animals`)

Defined in `config/groups.yaml` (versioned). Build fails if any class holding ≥ 0.01% of kept records is unmapped.

| Group id | Label | Rule (GBIF `class`/`phylum`) |
|---|---|---|
| `mammals` | Mammals | class Mammalia |
| `birds` | Birds | class Aves |
| `reptiles` | Reptiles | class Reptilia (as in the GBIF backbone; birds are separate) |
| `amphibians` | Amphibians | class Amphibia |
| `fishes` | Fishes | fish classes in the backbone: ray-finned (Actinopterygii; in the 2026 taxonomy mostly class **Teleostei**, plus Holostei, Chondrostei, Cladistia), cartilaginous (Elasmobranchii/Holocephali or Chondrichthyes as present), lobe-finned (Sarcopterygii), hagfishes and lampreys — final list from the step-0 class inventory |
| `insects` | Insects | class Insecta |
| `other_invertebrates` | Other invertebrates | all remaining Animalia not in the groups above |

"Fishes" is a functional grouping, not a clade; the UI says "Fishes (grouped)" in Data notes.

### 5.2 Trees (lens `trees`)

| Group id | Label | Rule |
|---|---|---|
| `conifers` | Conifers | tree-list species with class Pinopsida |
| `flowering` | Flowering trees (Magnoliopsida) | tree-list species with class Magnoliopsida |
| `palms` | Palms | tree-list species with family Arecaceae |
| `other_trees` | Other trees | remaining tree-list species (e.g. cycads, tree ferns, Ginkgo) |

"Tree" is defined only by membership in the tree list. Data notes shows list name, version and species count. Occurrence of a tree species is **not** forest cover.

## 6. Time bins

| Id | Years | Label |
|---|---|---|
| B00 | 1700–1949 | Before 1950 |
| B01 | 1950–1959 | 1950s |
| B02 | 1960–1969 | 1960s |
| B03 | 1970–1979 | 1970s |
| B04 | 1980–1989 | 1980s |
| B05 | 1990–1999 | 1990s |
| B06 | 2000–2009 | 2000s |
| B07 | 2010–2019 | 2010s |
| B08 | 2020–snapshot year | 2020– (partial) |
| `all` | all kept years | All years (sum of B00–B08) |

Effort for a cell/bin = number of kept records of the active lens and group in that cell/bin (`all` group = whole lens). Normalised value = species records ÷ effort. Cells with effort < 30 are "insufficient effort" (tunable constant `MIN_EFFORT`).

## 7. Pipeline

Runs as a scripted job (Python 3.12, DuckDB, H3). A reproducible command: `make data SNAPSHOT=<id>`.

| Step | Name | Action | Outputs / checks |
|---|---|---|---|
| 0 | Verify | List snapshot; read Parquet schema; confirm field names and licence enumerations; inventory classes; count rows | `schema.json`, fail on mismatch |
| 1 | Filter | DuckDB `read_parquet('s3://…')` with F1–F9, column pruning to needed fields; write `kept.parquet` (partitioned by kingdom and year bin) to the build bucket | Per-stage drop counts to manifest |
| 2 | Assign cells | Compute H3 r2/r4/r6 per record (H3 DuckDB extension or Python UDF in batches) | Parquet with cell ids |
| 3 | Aggregate | Group by (lens, group, res, cell, bin) for density files; group by (speciesKey, res, cell, bin) for species files; per-cell top-20 species per bin for region summaries | Parquet aggregates (also the Athena tables) |
| 4 | Species index | Species with ≥ `MIN_SPECIES_RECORDS` (default 100) kept records get a species file; build vernacular-name table; prefix-sharded search index | `species/*.json.gz`, `search/*.json.gz` |
| 5 | Sensitive flags | See §9 | flag table |
| 6 | Conservation | Join category (SRC-2) | `conservation` fields embedded in species files |
| 7 | Curated | Validate and copy life-cycle records; build fails if any lacks required citations (SI-05) | `lifecycle/*.json` |
| 8 | Encode | Binary density files (`WSC1`), species JSON, region shards, manifest | size report vs NFR-03 |
| 9 | Test | Sampling tests: 200 random cells recomputed independently in SQL; checksum; schema validation | pass/fail report |
| 10 | Publish | Upload to the data bucket under `/data/v1/<snapshot>/`; invalidate CloudFront for `/data/v1/latest.json` only | |

Compute: a single instance in us-east-1 with enough RAM/NVMe to stream the filtered data (instance size and runtime are measured on first run; UD-07). Alternative for step 1–3: Athena `CTAS` over the same Parquet (bytes scanned billed per TB; column pruning applies). Choose by measured cost and time.

## 8. Output assets (served from S3 via CloudFront under `/data/v1/<snapshot>/`)

| ID | Path | Content | Format |
|---|---|---|---|
| A-01 | `manifest.json` | Snapshot, counts per stage, group definitions, bin definitions, tree list version, curated-species list, asset hashes, attribution strings | JSON |
| A-02 | `cells/<lens>/<group>/r2.bin`, `r4.bin`; `r6/<res2-parent>.bin` | Density per cell × 9 bins | `WSC1` binary, brotli |
| A-03 | `species/<speciesKey>.json` (stored gzip, served with `Content-Encoding: gzip`) | Meta, names, taxonomy, conservation, sensitive flag, per-bin totals, r4 cells (sparse), optional r6 cells | JSON |
| A-04 | `search/<prefix2>.json` (stored gzip) | Species index entries `[speciesKey, scientificName, vernacularNames[], lens, group, records]` for names beginning with that 2-letter prefix | JSON |
| A-05 | `region/<lens>/<res2-parent>.json.gz` | For each populated res-4 cell in the parent: per-bin top-20 species `[speciesKey, count]`, per-bin totals, per-bin effort | JSON |
| A-06 | `lifecycle/<speciesKey>.json` | Curated life-cycle record (§10) | JSON |

`WSC1` layout (little-endian): magic `WSC1` · u8 version · u8 resolution · u16 groupIndex · u32 nCells · `u32[nCells]` h3Hi · `u32[nCells]` h3Lo · `u32[nCells×9]` counts (cell-major, bins B00–B08; `all` computed client-side as the sum).

Species file r6 policy: included only when species has ≥ `MIN_SPECIES_RECORDS` and ≤ 30,000 populated r6 cells; otherwise L2 for that species renders r4 cells (a note appears: "Finest detail unavailable for this species").

Size model (to be measured; formulas, not promises): density file raw bytes ≈ 8 + 44 × cells. Initial payload for one lens at group `all` = r2 + r4 files; target after compression ≤ 6 MB (NFR-03). If exceeded, options in order: quantise counts to u16 with log scale, drop bins from the initial fetch (load B-selected only), split r4 into res-1 shards.

## 9. Sensitive species handling

A species is flagged `sensitive = true` when any of:
1. ≥ 20% of its kept records have non-empty `datageneralizations` (tunable) — **not applicable to the AWS snapshot, which has no `datageneralizations` column** (step 0, 2026-10-31),
2. its `speciesKey` is in `config/sensitive.yaml` (manually maintained; reasons recorded),
3. (future) IUCN/CITES location-sensitivity indicator.

Effect: L2 disabled (cap at r4), record-extent target not narrower than r4, "Location generalised" chip. Data notes explains the rule. This reduces but does not eliminate risk: coarse public aggregates are the product's design.

## 10. Curated records

### 10.1 Life-cycle record schema

```json
{
  "speciesKey": "<GBIF speciesKey>",
  "scientificName": "<accepted name>",
  "lens": "animals | trees",
  "stages": [
    {
      "order": 1,
      "id": "<slug>",
      "name": "<stage name>",
      "description": "<own words, ≤ 400 chars>",
      "timing": { "value": "<text or null>", "conditions": "<text or null>", "citationIds": ["c1"] },
      "notes": [{ "text": "<text>", "citationIds": ["c2"] }]
    }
  ],
  "durationsComparable": false,
  "lifespan": { "value": "<text>", "kind": "typical | maximum_recorded | captive | wild", "conditions": "<text>", "citationIds": ["c3"] },
  "citations": [{ "id": "c1", "type": "journal | book | database | agency", "title": "...", "authors": "...", "year": 0, "doiOrUrl": "...", "accessed": "YYYY-MM-DD" }],
  "review": { "author": "<initials>", "reviewer": "<initials>", "reviewedAt": "YYYY-MM-DD" }
}
```

Validation (build step 7): ≥ 1 citation per stage with timing; every `citationIds` resolves; `author ≠ reviewer`; descriptions own-words (manual check; no copied passages); `speciesKey` exists in the species index; `lifespan.kind` present when `lifespan` present; no field may contain numbers without a citation reference.

### 10.2 Conservation fields in A-03

```json
"conservation": {
  "category": "LC | NT | VU | EN | CR | EW | EX | DD | NE | null",
  "source": "gbif-field | iucn-api | null",
  "assessmentYear": 2018,
  "iucnUrl": "https://www.iucnredlist.org/...",
  "retrieved": "YYYY-MM-DD"
}
```

`null` category means "not in the IUCN data used". `assessmentYear` is `null` when the source does not provide it, and the UI then omits the year. `NE` is displayed only when the source supplies it.

## 11. Known data limitations (surface in Data notes)

1. **Observer bias**: records follow people and projects, not animals or trees. Densest cells are often where observers live.
2. **Taxonomic bias**: birds and charismatic species are over-represented; many insects and tropical trees are under-recorded.
3. **Time bias**: record volume increases strongly in recent decades; raw bin-to-bin comparisons mislead — hence the effort strip and normalised mode (which reduces but does not remove bias).
4. **B08 partial** and publishing lag.
5. **Coordinate precision** varies; F8 reduces but does not remove errors; r6 is "records located in this cell", not "individuals".
6. **Taxonomy** follows the GBIF backbone at the snapshot; names change.
7. **Marine and polar** records are sparse.
8. **Licence filter** removes CC BY-NC records, biasing some taxa and countries.
9. **No absence data**; a cell without records says nothing about presence.
10. **Tree list** limits what "Trees" contains.

## 12. Features the available data cannot support

| ID | Wanted | Why unsupported | MVP treatment |
|---|---|---|---|
| UN-01 | Estimated geographic distribution (ranges) | Open licensed expert ranges not available | Not shown; noted in Data notes |
| UN-02 | Population size or abundance trends | Records ≠ counts | Not shown; wording forbids |
| UN-03 | "Species vanished from region X" | Requires absence data and effort-corrected modelling | Not shown; only "fewer records" |
| UN-04 | Life cycle for every species | No open, structured, reliable source | Curated set only |
| UN-05 | Seasonal/migration maps from occurrence dates | Not in MVP scope; sampling seasonality bias | Not shown |
| UN-06 | Tree cover/forest extent | Different dataset and licence | P2 |
| UN-07 | Terrain relief | Needs Cesium ion or a self-hosted terrain pipeline | P2 |
| UN-08 | IUCN assessment year for every species if only the GBIF field is used | The GBIF occurrence field is understood to carry the category only (verify in UD-01) | Year shown when source provides it |
| UN-09 | Real-time sightings | Snapshot is dated | Not offered |

## 13. Licensing and attribution (must appear in Data notes and README)

- GBIF: attribute "GBIF.org" and the snapshot; per-dataset attribution available via GBIF download DOIs (decision on citation format: UD-08).
- IUCN: attribution per IUCN terms; do not redistribute bulk tables beyond category per species unless permitted (UD-05).
- H3 (Apache-2.0), DuckDB (MIT), CesiumJS (Apache-2.0), React (MIT), fonts (SIL OFL): list in `THIRD_PARTY_NOTICES.md`.
- Images: per image.
- Our code: MIT (proposed). Our derived aggregate files: CC BY 4.0 (proposed; counts derived from CC0/CC BY data).
- Do not use Cesium ion default imagery/terrain without checking terms and tokens; avoid in MVP.

## 14. Step-0 verification record (2026-10-31, snapshot 2026-10-01)

- Path: `s3://gbif-open-data-us-east-1/occurrence/2026-10-01/occurrence.parquet/` (10,448 parts, 303.0 GB). Parts are grouped by dataset, not by country, and carry no column statistics, so a one-country slice still reads the country column of every part.
- Columns absent compared with the earlier assumption: `hascoordinate`, `hasgeospatialissues`, `datageneralizations`, any IUCN category column. Present and used: `issue` (VARCHAR[]), `specieskey` (VARCHAR), `year` (INTEGER), `coordinateuncertaintyinmeters` (DOUBLE), `license` (`CC0_1_0`, `CC_BY_4_0`, `CC_BY_NC_4_0`), `basisofrecord` (also `MATERIAL_SAMPLE`, which F4 excludes), `occurrencestatus` (`PRESENT`, `ABSENT`).
- Vernacular names are not in the snapshot. Source: Catalogue of Life eXtended Release via ChecklistBank (`/dataset/3LXR/taxon/{id}` and `/vernacular`, CC BY 4.0) for slices; the COL ColDP bulk download for full runs.
- The class inventory found `Teleostei` (bony fishes) as a class; `config/groups.yaml` maps it to `fishes`. The build fails on any unmapped chordate class above 0.01% of kept records.
- Conservation (step 6) has no source in the snapshot; species files carry `conservation.category = null` and the UI says "Not in the IUCN data used".
