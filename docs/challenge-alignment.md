# Challenge alignment — AWS Builder Center "Weekend Challenge: Map it"

A self-assessment against the four equally weighted criteria. Each claim points to evidence in this
repository or the live site (https://d2za8aq0bl0uib.cloudfront.net). Weaknesses are stated as plainly as
strengths; no scores are claimed.

## Submission checklist (from the challenge brief)

| Item | Status |
|---|---|
| Dataset description | Done: README "Dataset", Data notes in the app |
| How data is placed on the map; which AWS location/data service and why | Done: README "Architecture" and "AWS services"; [architecture.md](architecture.md) |
| At least one AWS service in the app or pipeline | Done: Amazon Location (Maps v2 + Places v2), CloudFront, S3, API Gateway, Lambda, CloudWatch, Budgets, CloudFormation; GBIF read from the Registry of Open Data on AWS |
| Live link | Done: https://d2za8aq0bl0uib.cloudfront.net |
| Public code repository | **Not done.** Code is committed locally; it still has to be pushed to a public GitHub repo |
| Demo video under 3 minutes | **Not done.** Script and shot list in [demo-script.md](demo-script.md); nothing has been recorded |
| Previously unpublished work, eligibility | For the entrant to confirm |

## 1. Technical innovation and originality (25%)

**Implemented**
- A three-level map that changes **what kind of data** it shows as you zoom, not just its resolution:
  snapshot aggregates (H3 res 2 → res 4) above 1,200 km, then live individual records with density
  dots and clustered, clickable points (`web/src/globe/lod.ts`, `Globe.tsx`, `state/live.ts`).
- H3 cells rasterised per map tile in a custom Cesium imagery provider, with picking done through
  h3-js, so tens of thousands of cells are drawn without uploading polygon geometry (`globe/cellLayer.ts`).
- A compact binary density format (WSC1) and content-versioned dataset ids, so immutable caching is
  safe (`pipeline/wildscope/build.py`, step 8).
- Reading the 303 GB GBIF snapshot in place with DuckDB over S3, with resumable per-file processing.
- Amazon Location used two ways: Maps v2 raster tiles inside CesiumJS (an integration the spec listed
  as uncertain, UD-02, now verified live), and Places v2 behind IAM in Lambda.

**Evidence:** screenshots `03`, `04`, `05`; `docs/REVIEW.md` §2 and §7; live site.

**Could improve:** the full-snapshot build has not been run, so the snapshot layers rest on a 0.3% file
sample; resolution 6 cells were not built; no worker-thread rendering yet.

## 2. Craft and execution (25%)

**Implemented**
- Automated checks: 33-check data validation including an independent recount of 200 random cells
  (step 9), 15 frontend unit tests, 4 Lambda tests, ESLint, TypeScript, pyflakes, cfn-lint, a CSP
  consistency check, and a wording lint that enforces the scientific-integrity rules.
- Infrastructure as code (CloudFormation), private buckets behind Origin Access Control, security
  headers verified live (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy), a referrer-
  and action-restricted Maps key, stage throttling, a 5xx alarm and a cost budget.
- Failure handling at every layer (retries, fallbacks, honest error states), described in
  [architecture.md](architecture.md) §6.
- Bugs found in production testing were traced to root causes and fixed: stale mixed caches (versioned
  dataset paths), a no-op Retry button, an uncertainty filter that dropped 97% of records in Lahore, a
  WebGL context leak, a basemap that ignored the Maps key (`docs/REVIEW.md`).

**Evidence:** `make check` targets, `pipeline/out/*.test_report.json`, `web/src/core.test.ts`,
`lambda/tests/`, `infra/wildscope.yaml`.

**Could improve:** no end-to-end browser tests, no accessibility audit, no CI/CD (manual deploys), no
measured frame rates.

## 3. Usefulness and impact (25%)

**Implemented**
- Anyone can go from the planet to a neighbourhood and see which animals people have recorded there,
  when, and by whom, with photos credited to their creators (screenshots `03`, `05`, `06`).
- Analytics from real data at two levels: snapshot cell summaries (records, species, datasets, periods,
  groups, top species, coverage) and live "records in view" (GBIF total, top species, IUCN categories,
  classes) (screenshots `08`, `09`).
- Time filter across both layers, with sampling effort beside every species series.
- Every number is labelled with its source; Data notes lists every filter stage and its count
  (screenshot `10`).

**Evidence:** live site; `web/src/components/Panels.tsx`, `DataNotes.tsx`.

**Could improve:** Trees are not available; the snapshot layers need the full build; no export or
download of results; English only.

## 4. Creativity and storytelling (25%)

**Implemented**
- The product is built around one honest story: *these are records, not animals*. The legend, timeline
  notes, empty states and Data notes all say so, and the wording lint stops the code from claiming
  absence, decline or abundance.
- A single continuous journey on one globe: arrival screen → global pattern → regional cells → a city's
  individual records → one photographed observation → that species across the world.
- Design system with a restrained palette over natural-colour satellite imagery, so data and place
  stay readable together.

**Evidence:** screenshots `00`–`10`; `web/scripts/wording-lint.mjs`; `wildscope-product-blueprint/`.

**Could improve:** a recorded demo video; a guided tour (specified, not built); short curated "stories"
(e.g. one species' records over decades) would help first-time visitors.

## Actions before public submission

1. Push the repository to a public GitHub repo and add its URL to the README.
2. Record the demo video from [demo-script.md](demo-script.md) (under 3 minutes).
3. Optionally run the full-snapshot build (`make data-aws REPO_URL=…`) so the snapshot layers are complete.
4. Confirm the AWS Budgets email subscription.
