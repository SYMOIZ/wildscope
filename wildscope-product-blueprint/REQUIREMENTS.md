# WildScope — Requirements

Priority key: **P0** = contest cut (must exist for the Nov 2026 submission) · **P1** = completes the MVP · **P2** = future (blocked by data, licence or time).
MVP = P0 + P1. Every requirement maps to one or more acceptance criteria (AC-xxx) in ACCEPTANCE_CRITERIA.md and to screens (S01–S10) in SCREEN_SPECIFICATIONS.md.

## 1. Glossary (shared with all documents)

- **Lens**: `trees` or `animals`. Exactly one is active.
- **Group**: taxonomic grouping inside a lens (DATA_ARCHITECTURE §5).
- **Cell**: an H3 hexagon at resolution 2, 4 or 6.
- **LOD**: level of detail chosen by camera height — L0 = H3 res 2, L1 = H3 res 4, L2 = H3 res 6.
- **Bin**: one of nine time bins B00–B08 (DATA_ARCHITECTURE §6).
- **Effort**: number of qualifying records of the whole lens/group in a cell and bin; a proxy for observer activity.
- **Snapshot**: the dated GBIF occurrence export on AWS from which all data is derived.

## 2. Functional requirements

### 2.1 Globe and navigation

| ID | Pri | Requirement | Screens |
|---|---|---|---|
| FR-01 | P0 | Full-screen 3D globe (CesiumJS) is the first thing rendered on arrival; no gate screen blocks interaction after the 3-second arrival sequence, which can be skipped. | S01, S02 |
| FR-02 | P0 | Drag to rotate, wheel/pinch to zoom, right-drag or two-finger drag to tilt; double-click flies to point. Keyboard equivalents exist (INTERACTION_SPECIFICATIONS §2). | S02 |
| FR-03 | P0 | Camera height selects LOD automatically: L0 ≥ 8,000 km, L1 2,000–8,000 km, L2 < 2,000 km. Hysteresis of 10% prevents flicker. | S02 |
| FR-04 | P0 | Density layer: each cell is filled by log-scaled record count using the active lens ramp. Empty cells are transparent, never coloured as "zero". | S02–S04 |
| FR-05 | P0 | Lens switch (Trees / Animals) re-renders the whole globe within 1 s of data availability and preserves camera, bin and (if valid) species. | S03, S04 |
| FR-06 | P0 | Group filter inside the lens (single-select + "All"). | S03, S04 |
| FR-07 | P1 | Region summary: clicking a cell opens the right panel with the cell's record total, effort, and top 20 species for the active bin. | S02 |
| FR-08 | P0 | Legend with log-scale breaks and the text "Colour shows recorded occurrences, not abundance." Always visible, collapsible. | S02 |
| FR-09 | P0 | Share URL encodes lens, group, species, bin, mode, camera (lat, lon, height). Opening it reproduces the view. | all |

### 2.2 Species

| ID | Pri | Requirement | Screens |
|---|---|---|---|
| FR-10 | P0 | Species search by scientific or vernacular name with typeahead (≤ 300 ms after local index loaded). Results labelled with lens, group, record count. | S08, S02 |
| FR-11 | P0 | Selecting a species switches the globe to *species mode*: only that species' cells are drawn, in the lens ramp; camera flies to the bounding region of its records (with outlier trimming: central 98% of record positions). | S02, S05 |
| FR-12 | P0 | Species detail panel: accepted name, rank, taxonomy chain, vernacular names (with language tag), record total, first and last year with records, licence mix, provenance link. | S05 |
| FR-13 | P1 | Conservation classification chip: IUCN category text, assessment year when the source provides it, IUCN link. Species with no IUCN match show "Not in the IUCN data used" — never "Not evaluated" unless IUCN says so. | S05 |
| FR-14 | P1 | Representative image from a source with a compatible licence, with attribution; otherwise typographic placeholder. No image is ever AI-generated. | S05 |

### 2.3 Time

| ID | Pri | Requirement | Screens |
|---|---|---|---|
| FR-15 | P0 | Timeline with nine bins and an "All years" option. Selecting a bin re-renders the layer from stored aggregates for that bin. | S06 |
| FR-16 | P0 | Play mode steps through B00→B08, 1.5 s per bin, pausable; honours reduced motion (steps with no crossfade). | S06 |
| FR-17 | P0 | Effort counter shown under the timeline: record total for the whole lens/group per bin as a thin bar series, so users see sampling intensity beside species data. | S06 |
| FR-18 | P0 | **Effort-normalised mode** toggle: cell value = species records ÷ lens/group effort in that cell and bin. Cells with effort < 30 are rendered hatched ("insufficient effort") and excluded from the legend range. | S06, S02 |
| FR-19 | P1 | Bin B08 is labelled "2020–<snapshot year> (partial)" and carries a note that the bin is incomplete and that data publishing lags. | S06 |

### 2.4 Life cycle and biology

| ID | Pri | Requirement | Screens |
|---|---|---|---|
| FR-20 | P1 | Life-cycle view for species that have a curated record: ordered stages, each with name, description, duration/timing *only if cited*, and citation. Species without a record show "No reviewed life-cycle record yet" and a link to the source taxonomy page. | S07 |
| FR-21 | P1 | Biological lifespan block with value, kind (typical / maximum recorded / captive / wild), conditions, citation. Absent when not curated. | S05, S07 |
| FR-22 | P0 | Sensitive-species protection: records for species flagged sensitive (GBIF generalisation or IUCN-restricted lists) are drawn only at L0/L1; L2 is disabled for them with an explanatory note. | S02, S05 |

### 2.5 Search, compare, ask

| ID | Pri | Requirement | Screens |
|---|---|---|---|
| FR-23 | P0 | Geographic search through Amazon Location Service (places, countries, regions); selecting a result flies the camera and opens the region summary for the cell under the target. | S08 |
| FR-24 | P1 | Comparison: (a) two species in one bin, (b) one species in two bins, (c) two regions for one lens. Shows linked globes (split) and a difference layer only for (b) with normalised mode. | S10 |
| FR-25 | P1 | "Ask WildScope": free-text question → Bedrock → one of a fixed set of intents (API_CONTRACTS §6) → executed against stored aggregates → templated answer, with the resulting globe state applied and a "How this was computed" disclosure. | S09 |
| FR-26 | P1 | If the question is outside supported intents, the interface says which intents are supported and offers three runnable examples; it never improvises an answer. | S09 |

### 2.6 Trust, accessibility, platform

| ID | Pri | Requirement | Screens |
|---|---|---|---|
| FR-27 | P0 | **Data notes** panel reachable from every screen: snapshot date, filters applied, licence filter, excluded record counts, known biases. | all |
| FR-28 | P0 | Every number on screen carries a source id resolvable in the data notes; build-time test fails if a number renders without one (AC-040). | all |
| FR-29 | P1 | Non-visual alternative: a "Table view" of the current region's top species and the current species' cells by country, keyboard navigable. | S02, S05 |
| FR-30 | P0 | Responsive: desktop (≥ 1024 px) full spec; tablet (640–1023 px) panel as bottom sheet; phone (< 640 px) reduced: globe + lens + search + timeline; compare and AI are available but single-column. | all |
| FR-31 | P0 | Loading, empty, partial-data and error states defined per screen (SCREEN_SPECIFICATIONS) and reachable by test fixtures. | all |
| FR-32 | P1 | Reduced motion and high-contrast preferences honoured. | all |
| FR-33 | P2 | Estimated geographic distribution layer (range polygons) — blocked by licence. | — |
| FR-34 | P2 | Life-cycle coverage beyond curated set via a reviewed ingestion pipeline. | — |
| FR-35 | P2 | Forest-cover / land-cover context layers for trees. | — |
| FR-36 | P2 | Terrain elevation on the globe. | — |
| FR-37 | P2 | User accounts, saved collections, offline mode. | — |

## 3. Non-functional requirements

| ID | Pri | Category | Requirement (targets to be validated on reference hardware, ACCEPTANCE_CRITERIA §1) |
|---|---|---|---|
| NFR-01 | P0 | Performance | Time to interactive globe ≤ 4 s on a 50 Mbit/s connection, mid-range laptop (4-core CPU, integrated GPU). |
| NFR-02 | P0 | Performance | ≥ 30 fps while rotating at L1 with the density layer visible on the reference laptop. |
| NFR-03 | P0 | Payload | Initial data (L0 + L1 for one lens, gzip/brotli) ≤ 6 MB; any single shard ≤ 600 KB compressed. |
| NFR-04 | P0 | Availability | Static data and app served through CloudFront; API failure must leave the globe and timeline usable (graceful degradation). |
| NFR-05 | P0 | Security | No secrets in the browser except an Amazon Location API key restricted by referrer and by allowed actions. |
| NFR-06 | P0 | Privacy | No cookies requiring consent; no user identifiers stored; Ask text is not persisted beyond CloudWatch retention of 7 days with request body redacted. |
| NFR-07 | P1 | Accessibility | WCAG 2.2 AA for all non-canvas UI; keyboard-operable canvas controls. |
| NFR-08 | P1 | Browser | Latest two versions of Chrome, Edge, Firefox, Safari; WebGL2 required, graceful message otherwise. |
| NFR-09 | P0 | Licence | Only records licensed CC0 or CC BY are used; attributions rendered in data notes (DATA_ARCHITECTURE §8). |
| NFR-10 | P0 | Cost | Monthly steady-state infrastructure cost for 10,000 sessions ≤ a ceiling set before launch (AWS_ARCHITECTURE §8); budget alarm at 80%. |
| NFR-11 | P1 | Observability | Structured logs, p50/p95 latency per endpoint, error rate alarms. |
| NFR-12 | P0 | Reproducibility | The entire data build is a scripted pipeline with a manifest (inputs, counts, hashes); re-running with the same snapshot yields byte-identical outputs. |

## 4. Scientific integrity requirements

| ID | Pri | Rule |
|---|---|---|
| SI-01 | P0 | Absence of records is never rendered as absence of the species. Copy template: "No records in this bin" — never "none live here". |
| SI-02 | P0 | The word *extinct* appears only inside the Conservation classification chip when IUCN category is EX or EW, with assessor and, when provided, year. Not in tooltips, AI answers, timelines or notes otherwise. |
| SI-03 | P0 | A fall in records between bins is described as "fewer records", always adjacent to the effort series. |
| SI-04 | P0 | Convex hulls, bounding boxes or kernel surfaces computed by WildScope are never called "range", "distribution" or "habitat". |
| SI-05 | P0 | Life-cycle durations, lifespans and counts require a citation in the curated record; records without a citation fail the data build. |
| SI-06 | P0 | AI answers are templated strings filled with computed numbers; the model does not generate biological statements. |
| SI-07 | P0 | Dates shown as "first recorded year" are labelled "earliest record in snapshot", not "first appeared" or "discovered". |
| SI-08 | P0 | Specimens from living collections, fossils and records flagged with geospatial issues are excluded and counted in data notes. |

## 5. Out of scope for MVP (explicit)

Estimated distributions, habitat models, species identification, user uploads, notifications, native mobile apps, languages other than English (vernacular names may be multilingual), terrain relief, fossil and extinct-species reconstruction, social sharing beyond URLs.
