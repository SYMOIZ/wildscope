# WildScope

A 3D globe of **where animals have been recorded**, built from the GBIF occurrence snapshot in the
Registry of Open Data on AWS. Records are binned into H3 hexagons, split by animal group and by nine
time bins, and always shown next to the sampling effort behind them.

Built for the AWS Builder Center **"Weekend Challenge: Map it"**. The product and engineering spec
lives in [`wildscope-product-blueprint/`](wildscope-product-blueprint/README.md); this repository
implements its contest cut (TECHNICAL_ROADMAP §2).

> Records are not presence or absence. A cell without records says nothing about whether a species
> lives there, and fewer records in a decade do not mean fewer animals.

## What it does

- Full-screen CesiumJS globe with an H3 density layer: res 2 when the camera is at or above 8,000 km,
  res 4 below (10% hysteresis). Log-scaled 7-step ramp; empty cells stay transparent.
- **Lens switch** Trees / Animals. Only Animals has data in this build: the tree species list (UD-04)
  is not settled, and the Trees lens says so instead of drawing an empty globe.
- **Group filter**: Mammals, Birds, Reptiles, Amphibians, Fishes (grouped), Insects, Other invertebrates.
- **Species search** over a static, prefix-sharded index (scientific and vernacular names), plus
  **place search** through Amazon Location Service in the same box.
- **Species mode**: only that species' cells are drawn; the camera fits the central 98% of its record
  positions. A species panel shows names, taxonomy, record total, earliest and latest record in the
  snapshot, licence mix and top countries.
- **Nine-bin timeline** (before 1950, the 1950s … 2010s, 2020 onwards (partial)) with Play, an
  **effort strip**, and an **effort-normalised** toggle (records ÷ effort; cells with effort under
  `MIN_EFFORT` are hatched and left out of the legend scale).
- **Data notes** drawer with the snapshot id, every filter stage and its drop count, biases, licences
  and the GBIF citation, all read from the build manifest.
- **Share URL** encoding lens, group, species, bin, mode, normalised flag, camera and dataset id.

## Architecture

```
 Browser (React + TypeScript + CesiumJS, Vite)
   │  /            app (HTML/JS/CSS, self-hosted fonts, Cesium assets)
   │  /data/v1/…   static aggregates (manifest, WSC1 density files, species and search JSON)
   │  /api/v1/…    place search
   ▼
 Amazon CloudFront ──OAC──► S3 app bucket (private)
        │         └─OAC──► S3 data bucket (private, pre-compressed brotli/gzip, immutable cache)
        └── /api/* ──────► API Gateway HTTP API ──► Lambda (Python 3.12, arm64)
                                                      └─► Amazon Location Service Places v2 (SearchText, IAM)
 Browser ──► Amazon Location Service Maps v2 raster tiles (API key restricted to GetTile + site referrer)

 Build: Python + DuckDB + H3 ──reads──► s3://gbif-open-data-us-east-1/occurrence/<snapshot>/occurrence.parquet/
        (dev slice locally, full snapshot on a self-terminating EC2 instance in us-east-1: infra/build-job.yaml)
```

The globe's hot path is static files only; the API is used just for place search, and its failure
leaves the globe and timeline working. Density cells are rasterised per map tile into a custom
Cesium imagery layer (UD-03 default), and cell picking uses h3-js on the picked coordinate, so no
polygon geometry is uploaded to the GPU.

### AWS services and why

| Service | Use |
|---|---|
| **Registry of Open Data on AWS** (GBIF snapshot, S3) | The dataset. Read in place with DuckDB over S3, column-pruned. |
| **Amazon Location Service** | **Places v2** `SearchText` behind Lambda for geographic search (no key in the browser); **Maps v2** raster satellite tiles as the globe basemap via an API key restricted to `geo-maps:GetTile` and the site's referrer. This is the location service the challenge asks for. |
| **Amazon S3** | Private app, data and build buckets. |
| **Amazon CloudFront** | One distribution with Origin Access Control, security headers (CSP, HSTS), long immutable caching for snapshot files. |
| **Amazon API Gateway (HTTP API)** + **AWS Lambda** | `/api/v1/health` and `/api/v1/geo/search`, throttled at the stage. |
| **AWS Budgets**, **Amazon CloudWatch** | Monthly budget with 50/80/100% email alerts; API 5xx alarm; 14-day log retention. |
| **AWS CloudFormation** (with the SAM transform for packaging) | Everything above, in `infra/wildscope.yaml`. |
| **Amazon EC2** (optional) | Full-snapshot build job, `infra/build-job.yaml`, terminates itself. |

## Dataset

- **GBIF occurrence snapshot** `occurrence/<date>/occurrence.parquet/` in
  `s3://gbif-open-data-us-east-1` (https://registry.opendata.aws/gbif/). Step 0 verified snapshot
  `2026-10-01`: 10,448 Parquet parts, 303.0 GB.
- Filters, in order, each with a recorded drop count (DATA_ARCHITECTURE §3): coordinates present and
  valid; no GBIF geospatial issue flag; `occurrencestatus = PRESENT`; basis of record is human,
  machine or unspecified observation or preserved specimen (fossils, living collections and material
  samples are excluded); licence CC0 or CC BY 4.0; resolved to a species; year 1700 to the snapshot
  year; coordinate uncertainty unknown or at most 10 km; kingdom Animalia.
- **Names**: the snapshot keys species with Catalogue of Life eXtended Release ids, so accepted names
  and vernacular names come from ChecklistBank (CC BY 4.0).
- Every figure the UI shows comes from the build outputs: the manifest (A-01), density files (A-02),
  species files (A-03) and search shards (A-04). Each number in the UI carries a `data-source` id.

### Data pipeline

`pipeline/wildscope/build.py` implements steps 0–4 and 8–10 of DATA_ARCHITECTURE §7:

| Step | What it does |
|---|---|
| 0 verify | Lists snapshots, reads the Parquet schema, checks required columns and types, samples enumerations; fails on mismatch. Writes `schema.json`. |
| 1 filter | F1–F9 in one pass per part file (resumable, retried), recording the stage that removed each row. |
| 2–3 cells, aggregate | H3 res 4 per record (DuckDB `h3` extension), res 2 by parent; groups from `pipeline/config/groups.yaml`; fails on an unmapped chordate class. |
| 4 species | Species with ≥ `MIN_SPECIES_RECORDS` records get a JSON file; names from ChecklistBank; prefix-sharded search index. |
| 8 encode | `WSC1` binary density files per group and resolution, manifest with stage counts, hashes and size report. |
| 9 test | 200 random cells recomputed independently (Python H3 on raw coordinates vs the decoded binary), r2 = sum of r4 children, species totals, SHA-256 checks, JSON Schema validation (`contracts/`). Publishing refuses a failed report. |
| 10 publish | Uploads pre-compressed files with immutable caching, then `latest.json`, and invalidates only `latest.json`. |

```bash
make data-sample                 # dev slice: every 300th part file (labelled "sample build" in Data notes)
make data-country C=PK           # one country (practical only inside us-east-1, see Limitations)
make data-full                   # full snapshot, bulk names (run in us-east-1)
make data-aws REPO_URL=https://github.com/<you>/<repo>.git   # full snapshot on EC2
```

Outputs are byte-identical for the same snapshot and parameters except the manifest's
`retrievedAt` date.

## Run locally

```bash
make setup
make data-sample
make dev            # http://localhost:5173 ; place search needs a deployed API (WILDSCOPE_API=https://<distribution> npm --prefix web run dev)
make check          # pyflakes, Lambda tests, cfn-lint, CSP check, ESLint + wording lint, typecheck, build
```

## Deploy

Needs AWS CLI v2 with credentials for an account where you can create IAM roles, in `us-east-1`.

```bash
make deploy BUDGET_EMAIL=you@example.com
```

This packages the Lambda, deploys `infra/wildscope.yaml`, builds the web app, writes `config.json`
with the Amazon Location key (never committed), uploads the app and the latest data build, and
prints the CloudFront URL. Confirm the AWS Budgets email subscription when it arrives.

## Scientific-integrity rules in code

- `web/scripts/wording-lint.mjs` fails the lint on words the spec forbids in UI text (SI-01 to SI-04, SI-07).
- Falls between bins are described only as "fewer records", next to the effort series (SI-03).
- The camera fit for a species is a viewing aid and is never described as where it lives (SI-04).
- Labels say "earliest record in snapshot" (SI-07); fossils, living collections and records with
  geospatial issues are excluded and counted (SI-08).
- No conservation classifications, life cycles or AI answers are shown in this build, so SI-02, SI-05
  and SI-06 have nothing to render.

## Limitations

- **Contest cut**: no region summaries (ranked species per cell), conservation chip, life cycles,
  Ask, Compare, or res 6 (L2). Clicking a cell shows its totals and effort only.
- **Trees lens has no data** until the tree list (UD-04) is decided.
- **Sample builds are partial**: `make data-sample` reads a fraction of the snapshot's part files.
  The Data notes drawer states the exact fraction; counts are not global totals.
- **Country slices still scan everything**: parts are grouped by dataset with no column statistics,
  so filtering by country reads the country column of all parts. Fast in us-east-1, slow elsewhere.
- **Sensitive species**: the snapshot has no `datageneralizations` column, so only the manual list in
  `pipeline/config/sensitive.yaml` applies (empty in this release). Since only res 2 and 4 are
  published, no species is shown finer than about 1,770 km² cells.
- **Names**: species missing from the COL release used keep the snapshot's species name without
  vernacular names.
- Records follow observers: dense cells are often where people record, not where animals are most common.
- **Not verified live by the author of this build**: the Amazon Location basemap tile URL
  (`maps.geo.<region>.amazonaws.com/v2/tiles/raster.satellite/{z}/{x}/{y}`) and the Places call run
  only once deployed. If basemap tiles fail, the app switches to bundled Natural Earth imagery and says
  so; place search then still works through the Lambda.
- Per-IP rate limits from the spec need AWS WAF and are not deployed; the API stage is throttled instead.

## Attributions

GBIF.org (occurrence data, CC0 and CC BY 4.0 records only; citation in the Data notes) ·
Catalogue of Life via ChecklistBank (names, CC BY 4.0) · Amazon Location Service (basemap and place
search; data-provider terms apply) · Natural Earth (fallback imagery) · CesiumJS, H3, h3-js (Apache-2.0)
· DuckDB, React (MIT) · Fraunces, Inter, JetBrains Mono (SIL OFL). Full list in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Code: [MIT](LICENSE). Derived aggregate data files: CC BY 4.0.
