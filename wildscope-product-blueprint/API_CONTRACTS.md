# WildScope — API Contracts

Two surfaces:
1. **Static data** (A-01…A-06) from CloudFront `/data/v1/<snapshot>/…` — defined in DATA_ARCHITECTURE §8. Immutable per snapshot: `Cache-Control: public, max-age=31536000, immutable`, except `/data/v1/latest.json` (`max-age=300`).
2. **Dynamic API** (E-01…E-09) behind CloudFront path `/api/*` → API Gateway (HTTP API) → Lambda. Same origin as the app (no CORS needed for the app; CORS allow-list for the CloudFront domain only, for local dev `http://localhost:5173`).

## 1. Conventions

- Base path `/api/v1`. JSON, UTF-8. Time `ISO-8601` UTC. All responses include `snapshot` (string) and `requestId`.
- Identifiers: `speciesKey` = GBIF backbone species key as string; `cell` = H3 index as 15-character hex string; `lens` ∈ `trees|animals`; `group` = id from DATA_ARCHITECTURE §5 or `all`; `bin` ∈ `B00…B08|all`.
- Errors (HTTP + body, RFC 9457 style):

```json
{ "type": "https://wildscope.example/errors/invalid-parameter",
  "title": "Invalid parameter",
  "status": 400,
  "detail": "bin must be one of B00..B08 or all",
  "requestId": "…",
  "retryAfterSeconds": null }
```

- Status codes: 200, 400 (validation), 404 (unknown species/cell), 408/504 (timeout), 422 (valid syntax, unsupported question), 429 (rate), 500, 503 (dependency down).
- Rate limits (initial): 60 req/min per IP across `/api/*`; `/api/v1/ask` 6 req/min per IP; excess returns 429 with `Retry-After`.
- Caching: GETs return `Cache-Control: public, max-age=300` (except geo reverse: 3600). CloudFront cache key includes the query string.
- Versioning: breaking changes → `/api/v2`. Additive fields are non-breaking; clients ignore unknown fields.
- No authentication in MVP (public read). No personal data accepted. `ask` text is processed and discarded (logs redacted).

## 2. E-01 `GET /api/v1/health`

200: `{ "status": "ok", "snapshot": "2026-10-01", "dependencies": { "athena": "ok|degraded", "bedrock": "ok|degraded", "location": "ok|degraded" } }`

## 3. E-02 `GET /api/v1/species/{speciesKey}/media`

Representative image for S05 (FR-14).

200:
```json
{ "speciesKey": "…",
  "image": { "url": "https://…", "width": 0, "height": 0,
             "license": "CC0 | CC BY | CC BY-SA", "creator": "…",
             "sourceName": "iNaturalist | GBIF | Wikimedia Commons", "sourceUrl": "https://…" },
  "snapshot": "…", "requestId": "…" }
```
`image: null` when none with an allowed licence is found. Lambda calls the external API with a timeout of 2.5 s and caches results in S3 for 30 days. Images are hot-linked, not copied, unless the source terms allow caching (UD-09).

## 4. E-03 `GET /api/v1/species/{speciesKey}/timeline?lens=&group=`

Species counts per bin joined with effort for the lens/group (for the expanded timeline, S06, and Compare).

200:
```json
{ "speciesKey": "…", "lens": "animals", "group": "birds",
  "bins": [
    { "bin": "B00", "label": "Before 1950", "records": 0, "effort": 0, "share": null },
    { "bin": "B01", "label": "1950s", "records": 0, "effort": 0, "share": 0.0 }
  ],
  "minEffort": 30,
  "notes": ["B08 is partial (2020–2026)."],
  "snapshot": "…", "requestId": "…" }
```
`share` = records ÷ effort, `null` when effort < `minEffort`. Values shown above are structure only, not data.

## 5. E-04 `GET /api/v1/region/summary?cell=&lens=&group=&bin=`

Region summary for the res-4 cell containing `cell` (any res 2/4/6 accepted; server resolves the res-4 parent; for res 2 returns 400 `use-finer-cell` — L0 summary is computed client-side from A-02 totals only).

200:
```json
{ "cell": "<res4 hex>", "resolution": 4, "areaKm2Approx": 1770,
  "place": { "label": "…", "source": "amazon-location | none" },
  "bin": "B05",
  "totals": { "records": 0, "effort": 0, "speciesWithRecords": 0 },
  "topSpecies": [ { "speciesKey": "…", "scientificName": "…", "vernacular": "…", "group": "birds",
                    "records": 0, "sensitive": false } ],
  "snapshot": "…", "requestId": "…" }
```
`topSpecies` max 20, ordered by records desc, ties by scientific name. Reads A-05.

## 6. E-05 `GET /api/v1/compare?type=&a=&b=&bin=&binB=&lens=&group=&normalised=`

- `type=species`: `a`, `b` = speciesKeys; same `bin`.
- `type=bins`: `a` = speciesKey; `bin` and `binB` two different bins; `normalised=true` required for `difference`.
- `type=regions`: `a`, `b` = res-4 cells; `lens`, `group`, `bin`.

200 (shared shape):
```json
{ "type": "species",
  "a": { "label": "…", "records": 0, "earliestYear": 0, "latestYear": 0, "cells": 0 },
  "b": { "label": "…", "records": 0, "earliestYear": 0, "latestYear": 0, "cells": 0 },
  "shared": { "cells": 0, "countries": [ { "code": "XX", "name": "…" } ] },
  "difference": { "available": false, "reason": "requires normalised mode", "cells": [] },
  "snapshot": "…", "requestId": "…" }
```
`difference.cells` entries: `{ "cell": "<res4 hex>", "shareA": 0.0, "shareB": 0.0, "delta": 0.0 }` only where both cells have effort ≥ `minEffort` and |delta| ≥ 0.05 of the species' share scale (S10 rule). `type=regions` may query Athena (§9) for place bounds covering multiple cells; the 8 s Lambda budget applies.

## 7. E-06 `GET /api/v1/geo/search?q=&biasLat=&biasLon=&limit=`

Proxy to Amazon Location Service Places (geocoding/search). `q` 2–100 chars; `limit` ≤ 5.

200:
```json
{ "results": [
   { "id": "…", "label": "…", "type": "country | region | locality | poi",
     "lat": 0.0, "lon": 0.0,
     "bounds": { "west": 0.0, "south": 0.0, "east": 0.0, "north": 0.0 },
     "countryCode": "XX" } ],
  "attribution": "…per Amazon Location Service data provider terms…",
  "snapshot": "…", "requestId": "…" }
```
`attribution` must be displayed where results are shown (provider terms, UD-10). No result storage; if the provider's terms require, results are not cached at CloudFront (set `Cache-Control: no-store`).

## 8. E-07 `GET /api/v1/geo/reverse?lat=&lon=`

200: `{ "label": "…", "countryCode": "XX", "attribution": "…" }`; `label` may be `null` over open ocean ("Ocean" fallback is client-side, not asserted by the API).

## 9. E-08 `POST /api/v1/ask`

Request:
```json
{ "text": "Which birds were recorded most around Lake Victoria in the 1990s?",
  "context": { "lens": "animals", "group": "all", "bin": "all", "species": null },
  "resolved": null }
```
`text` ≤ 300 chars. `resolved` is used for disambiguation replies (`{ "placeId": "…" }` or `{ "speciesKey": "…" }`).

### 9.1 Intent catalogue (closed set)

| intent | params | Executes | Answer template (filled only with computed values) |
|---|---|---|---|
| `show_species` | `speciesKey` | Select species | "Showing *{name}*: {records} recorded occurrences in {snapshot}." |
| `top_species_in_region` | `place` (id or cell), `lens`, `group`, `bin` | A-05 or Athena | "In {place}, the species with most recorded occurrences in {bin label} were: {list with counts}." |
| `compare_species` | `a`, `b`, `bin` | E-05 species | "{a}: {n}, {b}: {m} recorded occurrences in {bin label}." |
| `compare_bins` | `speciesKey`, `binA`, `binB` | E-05 bins | "Records of {name}: {nA} in {binA}, {nB} in {binB}. Overall effort changed from {eA} to {eB}." |
| `species_conservation` | `speciesKey` | A-03 | "IUCN category for {name}: {category label}{, assessed year if present}. Source: {source}." — if null: "{name} is not in the IUCN data used here." |
| `species_first_last_record` | `speciesKey` | A-03 | "Earliest record in the snapshot: {year}. Latest: {year}." |
| `show_lifecycle` | `speciesKey` | A-06 | Opens S07 if a record exists, else "No reviewed life-cycle record yet." |
| `explain_data_limit` | `topic` ∈ {`absence`, `extinction`, `bias`, `licence`, `snapshot`} | Static text from `data-notes` | Predefined paragraph, no generation |

Anything else → `422 unsupported-question` with the list above.

### 9.2 Processing

1. Validate payload; reject > 300 chars.
2. **Bedrock call** (model id from configuration; decision UD-11) with a system prompt that states: output only JSON matching the intent schema; no free text; no biology. Temperature 0. `max_tokens` 300. The prompt receives the question and a compact context (lens, group, bin, species key if any). It does **not** receive records.
3. **Validate** output against JSON Schema (`ajv`); on failure → 422.
4. **Resolve entities**: species names → index lookup (A-04) with exactness check (ambiguous → `needs_clarification`); places → E-06.
5. **Execute** deterministic query over aggregates (static or Athena workgroup with 1 GB scan cap, 20 s limit).
6. **Render** answer with templates. Model output is never shown to the user as text.
7. Return `applyView` (state patch) and `computed` (parameters, counts, snapshot).

Success 200:
```json
{ "status": "ok",
  "intent": "top_species_in_region",
  "answer": "…templated…",
  "applyView": { "lens": "animals", "group": "birds", "bin": "B05", "panel": "region", "cam": "…" },
  "computed": { "parameters": { "…": "…" }, "counts": { "…": 0 }, "queryMs": 0, "source": "A-05 | athena" },
  "snapshot": "…", "requestId": "…" }
```
Clarification 200: `{ "status": "needs_clarification", "kind": "place | species", "candidates": [ { "id": "…", "label": "…" } ], … }`.
Unsupported 422: `{ …problem…, "supportedIntents": [ "show_species", … ] }`.

Guardrails: no raw SQL from the model; Athena queries are parameterised from a fixed template list; the Lambda role has read-only access to the aggregate tables; Bedrock Guardrails (if used) are an additional layer, not the primary control (UD-11).

## 10. E-09 (reserved)

Reserved for GBIF/IUCN link resolution if needed; not in MVP.

## 11. Static asset contracts (summary)

| ID | Content-Type | Notes |
|---|---|---|
| A-01 | `application/json` | `manifest.json` schema in `/contracts/manifest.schema.json`; client refuses a manifest whose `schemaVersion` it does not support |
| A-02 | `application/octet-stream`, `Content-Encoding: br` | `WSC1`; client validates magic/version/length |
| A-03 | `application/json`, `Content-Encoding: gzip` | `/contracts/species.schema.json` |
| A-04 | same | array of index entries |
| A-05 | same | keyed by res-4 cell id |
| A-06 | `application/json` | schema DATA_ARCHITECTURE §10.1 |

JSON Schemas are the single source of truth; the TypeScript types are generated from them in CI; the Python pipeline validates outputs against them in build step 9.

## 12. Example contract tests (belong to ACCEPTANCE_CRITERIA §6)

- E-03 with `lens=animals&group=birds` returns exactly nine bins in B00–B08 order.
- E-04 for a res-6 cell returns the res-4 parent id.
- E-08 with a question outside the catalogue returns 422 and lists intents.
- E-08 never returns the model's raw text (assert `answer` ∈ template outputs).
- Any response containing the substring "extinct" (case-insensitive) must come from `species_conservation` with category EX or EW, or `explain_data_limit` topic `extinction` (the fixed paragraph).
