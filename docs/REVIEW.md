# WildScope — production review and improvement plan (2026-10-31)

Scope: review the deployed contest build (https://d2za8aq0bl0uib.cloudfront.net), find root causes of the
quality problems reported, and improve the existing implementation without a rebuild.

## 1. Architecture as deployed (audit)

| Layer | What exists | Files |
|---|---|---|
| Data build | Python + DuckDB + H3 over the GBIF AWS snapshot `2026-10-01`. Steps 0–4, 8–10. Output: manifest (A-01), WSC1 density files at H3 res 2 and 4 (A-02), species files (A-03), search shards (A-04). | `pipeline/wildscope/build.py`, `pipeline/config/*.yaml`, `contracts/*.json` |
| Deployed data | **Sample build**: 35 of 10,448 Parquet parts (every 300th). 13.4 M rows read, 8.26 M kept, 3,433 species files. | `pipeline/out/2026-10-01-sample300/` |
| App | React 19 + TypeScript + CesiumJS 1.146 (Vite 8). Density drawn as a custom imagery layer that rasterises H3 cells per tile; picking with h3-js. | `web/src/**` |
| API | One Lambda (Python 3.12): `/api/v1/health`, `/api/v1/geo/search` → Amazon Location Places v2. | `lambda/geo/handler.py` |
| Infra | CloudFormation (SAM transform): 3 private S3 buckets, CloudFront + OAC + CSP, HTTP API, Lambda, Location API key, 5xx alarm, budget. | `infra/wildscope.yaml`, `scripts/deploy.sh` |

Dependencies: cesium, h3-js, react, zustand, @fontsource (Fraunces, Inter, JetBrains Mono); duckdb, h3, boto3, brotli, jsonschema.

## 2. Problems found and root causes

| # | Problem (as seen) | Root cause | Fix |
|---|---|---|---|
| P1 | Satellite imagery looks dull and is hidden under colour | Basemap dimmed on purpose (brightness 0.55, saturation 0.7, from DESIGN_SYSTEM §2); hexes filled at 78% opacity at every zoom | Full-brightness imagery; cell opacity and fill style depend on zoom; outlines instead of fills when zoomed in |
| P2 | Huge hexagons when zoomed in | Finest published grid is H3 res 4 (≈1,770 km², ≈22 km edge); res 6 was cut; no individual-record layer | New **local level**: individual GBIF records in the current view, clustered, below 1,200 km camera height |
| P3 | Can't zoom close like Google Earth | Camera floor set to 200 km (spec constant) | Floor lowered to 1 km; imagery tiles go to level 16 |
| P4 | Clicking a cell shows a near-empty panel | Region summaries (A-05) were cut from the contest build | Pipeline now writes region files: totals, distinct species, groups, trend by bin, top species, datasets |
| P5 | No photographs, dates, locations, conservation status | Snapshot aggregates hold no media; IUCN source was undecided (UD-05) | Live GBIF records give photos (GBIF image cache), dates, coordinates ± uncertainty, recorder, licence; IUCN category from GBIF's species API |
| P6 | Patterns look odd / sparse | Deployed data is a 0.3% **file** sample; files are grouped by dataset, so whole regions come from one dataset | Full-snapshot build has to run in us-east-1 (`make data-aws`); the sample stays clearly labelled |
| P7 | Duplicates not removed | Not in the MVP filter list | New D1 filter: same species, coordinates (5 dp) and event date counted once; drops recorded |
| P8 | Trees lens is empty | No settled tree species list (UD-04) | **Needs your decision** (section 6) |
| P9 | Globe stopped drawing after a while (fixed during deploy) | WebGL2 support probe ran on every render and leaked contexts until Cesium's was dropped | Probe once and release it (`App.tsx`) |
| P10 | Live site used Natural Earth, not Amazon Location (fixed during deploy) | Basemap chosen before `config.json` loaded | Basemap effect waits for config (`Globe.tsx`) |
| P11 | Tablet/phone: panel covers legend, controls and timeline | Panel, legend and camera controls positioned independently | Layout zones; legend hides behind an open sheet; controls move with it |
| P12 | Small, low-contrast timeline labels and legend | Mono 0.75 rem on gradient | Larger labels, solid panel backgrounds, clearer hierarchy |
| P13 | Counts could disagree across views | Tooltip/panel used different files for some layers | One source per number, each labelled (snapshot A-02/A-03/A-05 or live GBIF API) |

## 3. Zoom-level blueprint

| Level | Camera height | What is drawn | Source |
|---|---|---|---|
| Global / continental | ≥ 8,000 km | H3 res 2 cells (≈86,800 km²), 55% fill | Snapshot A-02 |
| Country / regional | 1,200–8,000 km | H3 res 4 cells (≈1,770 km²), 40% fill + outline | Snapshot A-02 |
| Local | < 1,200 km | Individual records in view, clustered by screen distance; res 4 cells as faint outlines | Live GBIF occurrence API (same licence/coordinate/basis filters as the build) |
| Close-up | click a record | Record card: photo, species, date, coordinates ± uncertainty, basis, recorder, dataset, licence, link | Live GBIF record |

Hysteresis stays at 10%. Clusters split as the camera gets closer (Cesium entity clustering, 40 px).

Two timelines are kept apart: the **record timeline** (bins B00–B08, filters both the snapshot layer and the
live records) and the **imagery date**, which is the basemap provider's and is stated as unknown/varies in
Data notes; it never filters records.

## 4. Information architecture

- **Cell panel** (snapshot): recorded occurrences, distinct species, records by group, trend by bin with
  effort, top species (click → species), datasets contributing, share without stated coordinate
  uncertainty. Header says "H3 cell, res N".
- **View panel** (local level, live): records in view (total from GBIF), top species, IUCN categories
  present, records by class, plus the list of shown records.
- **Species panel**: names, taxonomy, snapshot records, earliest/latest record in snapshot, licence mix,
  top countries, by-bin chart, **photos** (licensed CC0/CC BY records only, with creator and licence),
  **IUCN category** (via GBIF; year not provided → omitted; "Not in the IUCN data used" if none).
- **Record card**: as in section 3. `establishmentMeans` (native/introduced) shown only when the record
  states it. Habitat: no verified structured source → not shown.

## 5. Data rules (unchanged principles, now enforced in more places)

- Records are occurrences, never abundance or absence; empty means "no records", never "absent".
- Every number carries a source id: A-01/A-02/A-03/A-05 (snapshot) or LIVE (api.gbif.org at request time).
  Snapshot and live counts are never mixed in one figure.
- Live records use: `hasCoordinate`, no geospatial issue, `occurrenceStatus=PRESENT`, licence CC0/CC BY 4.0,
  basis in the four kept values, coordinate uncertainty 0–10,000 m (records without stated uncertainty are
  excluded from the live layer and this is said).

## 6. Decision needed: Trees

"Trees" needs a list of which plant species are trees. Options: (a) BGCI GlobalTreeSearch (best coverage;
licence/terms must be confirmed before redistribution); (b) a small curated, cited list; (c) keep Trees empty.
Until decided, the Trees lens keeps its honest empty state. Nothing will be invented.

## 7. Test report (2026-10-31, local dev server and production build under the production CSP)

Automated
| Check | Result |
|---|---|
| Pipeline step 9 (sample build): checksums, JSON Schemas incl. new region schema, stage sums, 200 random cells recomputed independently with the D1 duplicate rule re-implemented, r2 = Σ r4, species totals, region files = density files, every populated res-2 cell has a region file | **33/33 pass** |
| Web unit tests (vitest): WSC1 decode, zoom levels + hysteresis, legend classes, species ranking, live query filters, licence normalisation, photo URLs (MD5 checked against a real GBIF response), record mapping, group mapping, number format | **15/15 pass** |
| Lambda unit tests | 4/4 pass |
| ESLint, TypeScript, wording lint (SI rules), pyflakes, cfn-lint, CSP web = CloudFront | all pass |
| Production build (`vite build`) | pass |

Manual (browser)
| # | Test | Result |
|---|---|---|
| 1 | Global view: res-2 cells, legend, arrival | pass |
| 2 | Regional view (3,000 km): res-4 cells with edges, imagery visible | pass |
| 3 | Local view (60 km, London): Amazon Location satellite imagery, GBIF density dots, clustered clickable records, level bar total (1,246,509 records in view) | pass |
| 4 | Cluster click zooms in; record click opens record card (species, vernacular, IUCN chip, date, coordinates ± uncertainty, recorder, dataset, licence, GBIF link) | pass after fix F1 |
| 5 | Record → Open species → species panel with 6 licensed photos (creator + licence), IUCN chip, period chart | pass after fix F3 |
| 6 | Species mode at local level: only that species (1,555 Song Thrush records in view), density dots for that species | pass after fix F2 |
| 7 | Cell click (regional): records, species, datasets, period chart, groups, top species with names, coverage | pass after fix F4 |
| 8 | Records-in-view panel with 1990s filter: `year=1990,1999` sent; 87,335 records; top species; IUCN categories | pass |
| 9 | Trees lens at local level: no points, honest message | pass |
| 10 | Phone width (375 px): no horizontal overflow, canvas and top bar fit, timeline docked | pass (layout values checked; preview screenshots of emulated phones are distorted by the pane) |
| 11 | Production build under the production CSP: GBIF API, tiles and photos allowed; no CSP violations | pass |
| 12 | Console | no app errors; GBIF returns 404 on the first request for a not-yet-generated thumbnail (handled by retry) |

Fixes made during testing
| # | Bug | Root cause | Fix |
|---|---|---|---|
| F1 | Clicking a cluster opened a cell panel instead of zooming | Cesium leaves cluster billboard ids empty | Attach member entities as the cluster id |
| F2 | Species mode at the local level counted the whole world (1.6 M) and drew no density dots | View rectangle read before the camera's first frame returned the whole globe | Sanity-check the rectangle against camera height; fall back to a box around the camera; also handles the antimeridian |
| F3 | Photos missing on first view | GBIF's image cache creates each size on first request and that request can fail | Retry once after 1.5 s, then drop the image |
| F4 | Banding codes shown as common names ("GRWA") | First English COL name taken as-is | `clean_vernacular`: drop codes, prefer single-species names |
| F5 | Stray lines at local zoom; group rail hidden under legend | Cell outlines too strong; rail centred vertically | Fainter outlines; rail under the top bar with backing; legend collapsed on short screens |

## 8. Files changed in this round

Pipeline: `pipeline/wildscope/build.py` (D1 duplicates, eventdate/datasetkey, step 3b region files, name cleaning, new step-9 checks), `contracts/region.schema.json` (new).
App (new): `web/src/data/gbif.ts`, `web/src/state/live.ts`, `web/src/components/{LevelBar,Bars,Conservation}.tsx`, `web/src/globe/lod.ts`, `web/src/data/search.ts`, `web/src/core.test.ts`.
App (changed): `Globe.tsx`, `cellLayer.ts`, `layerModel.ts`, `App.tsx`, `Panels.tsx`, `Legend.tsx`, `DataNotes.tsx`, `CameraControls.tsx`, `SearchBox.tsx`, `Icon.tsx`, `Num.tsx`, `store.ts`, `assets.ts`, `types.ts`, `interaction.ts`, `csp.ts`, `styles.css`, `wording-lint.mjs`, `package.json` (spark-md5, vitest).
Infra: `infra/wildscope.yaml` (CSP allows `https://api.gbif.org` for API calls, tiles and photos).

## 9. Production status and remaining limitations

- **Not deployed.** Production still runs the earlier build. Deploying needs `make deploy` (or `scripts/deploy.sh`): it updates the CSP via CloudFormation, uploads the new app, and publishes the rebuilt sample data with region files.
- **Data is still a sample** (35 of 10,448 parts). Snapshot-based figures (cells, cell panels, species files) are partial until the full build runs in us-east-1 (`make data-aws`). Live GBIF layers are complete.
- **Trees** still need a tree list decision (section 6).
- Live records and snapshot counts come from different sources by design and are labelled; they will not match each other.
- Habitat, life cycle, native/introduced (beyond what a record states) and IUCN assessment years have no verified source in this build and are not shown.
- Imagery date is not available from the provider and is explained in Data notes; it never filters records.
- Region summaries describe the res-4 or res-2 cell clicked; there is no polygon or country-level summary yet.
