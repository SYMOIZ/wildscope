# WildScope — Acceptance Criteria

ID ranges: AC-001–009 reserved · AC-010–029 globe/species · AC-030–039 time/life/compare · AC-040–049 scientific integrity · AC-050–059 accessibility/responsive · AC-060–079 API/data · AC-080–089 Ask · AC-090–099 security/cost/ops.

Format: **ID** · Given / When / Then · *Method* · Requirements. Numeric thresholds are release targets to be confirmed on the reference setup in §1; changing a threshold requires editing this file and recording why.

## 1. Measurement setup (reference conditions)

- **Reference laptop**: 4-core CPU (2021-or-later mainstream), 16 GB RAM, integrated GPU, 1920×1080, latest stable Chrome.
- **Reference phone**: mid-range Android (2022-class) and an iPhone from the last four generations, latest OS.
- **Network profiles**: "Broadband" 50 Mbit/s, 40 ms RTT; "Slow 4G" 1.6 Mbit/s, 150 ms RTT.
- **Tooling**: Lighthouse (lab), WebPageTest, Chrome performance traces, `cesium` frame stats overlay, axe-core, Playwright (E2E, visual regression), k6 (API load), pytest (pipeline).
- **Fixtures**: a "dev snapshot" (one country subset) for CI; a "full snapshot" for release testing.
- Each result is recorded in `/reports/<release>/` with tool, version, date.

## 2. Globe, navigation and species

| ID | Criterion | Method | Reqs |
|---|---|---|---|
| AC-010 | Given Broadband, when the root URL is opened, then an interactive globe with the density layer for the default lens appears in ≤ 4.0 s (median of 5 runs, p95 ≤ 6.0 s). On Slow 4G ≤ 9 s. | WebPageTest + custom `performance.mark('globe-interactive')` | FR-01, NFR-01 |
| AC-011 | While rotating at L1, the frame rate is ≥ 30 fps (median) with no frame > 100 ms over a 20 s scripted orbit. | Chrome trace, scripted | NFR-02 |
| AC-012 | Camera height thresholds 8,000 km and 2,000 km switch LOD; moving ±5% around a threshold does not flip LOD more than once (hysteresis). | Playwright with camera API | FR-03 |
| AC-013 | Initial data transfer (app excluded) for one lens at group `all` is ≤ 6 MB compressed; any single data shard ≤ 600 KB compressed. | Network log assertion in CI against dev and full snapshots | NFR-03 |
| AC-014 | Switching lens completes within 1.0 s after assets are cached and ≤ 3 s uncached (Broadband); camera, bin, normalised preserved; group resets to `all`. | Playwright | FR-05 |
| AC-015 | Empty cells are not rendered; a cell with count 0 never appears in the legend range. | Unit + visual regression | FR-04 |
| AC-016 | Search for an exact scientific name returns that species first in ≤ 300 ms after the prefix shard is cached; first uncached search ≤ 800 ms (Broadband). | Playwright timing | FR-10 |
| AC-017 | Selecting a species flies the camera to the trimmed extent within 2.6 s and shows only that species' cells; leaving species mode restores the previous camera within ±0.01° lat/lon and ±1% height. | Playwright | FR-11 |
| AC-018 | Species panel shows name, taxonomy, record total, earliest/latest record years, licence mix, provenance line; every figure has a source id (AC-040). | Playwright + DOM scan | FR-12 |
| AC-019 | Conservation chip text matches the source category label exactly; for a species with no source value, the text is "Not in the IUCN data used". | Unit with fixtures (all 9 categories + null) | FR-13 |
| AC-020 | Geographic search for a known city returns ≤ 5 results from Amazon Location; selecting one flies to the bounds and opens Region summary with the res-4 parent cell. | Integration test against a mocked and a live Location client | FR-23 |
| AC-021 | Clicking a cell opens the Region summary within 1.0 s (cached) with ≤ 20 species ordered by records desc then name asc. | Playwright | FR-07 |
| AC-022 | A sensitive-flagged species cannot be rendered at r6: camera height cannot go below 2,000 km in species mode and the chip "Location generalised" is shown. | Fixture species + Playwright | FR-22 |
| AC-023 | Share URL round-trip: for 50 random states, serialise → open in a fresh browser → serialise again produces identical state objects. | Property test | FR-09 |
| AC-024 | Unknown/invalid URL parameters are ignored without error and defaults applied. | Unit | FR-09 |
| AC-025 | Camera controls: drag rotates, wheel/pinch zooms (height clamped 200–25,000 km), right-drag tilts 0–60°, double-click flies to 1,500 km, `N` resets north in ≤ 0.6 s; arrow keys rotate 5° per press. | Playwright with camera API assertions | FR-02 |
| AC-026 | Group filter: selecting each group shows only cells from that group's file; the group list for each lens equals the manifest's group definitions; switching to a group that does not contain the selected species clears the species and shows the toast text in INTERACTION §4. | Playwright + manifest | FR-06 |
| AC-027 | Legend shows 7 steps with log breaks computed from the active layer, the sentence "Colour shows recorded occurrences, not abundance.", a collapse control, and the hatch swatch when normalised mode is on. | DOM + visual regression | FR-08 |
| AC-028 | Species image: when shown, attribution (creator, licence, source link) is visible and the licence is in {CC0, CC BY, CC BY-SA}; when none qualifies, the typographic placeholder is shown; no generated imagery is ever used. | Contract test on E-02 + Playwright | FR-14 |

## 3. Time, life cycle, compare

| ID | Criterion | Method | Reqs |
|---|---|---|---|
| AC-030 | Selecting each bin B00–B08 and `all` renders cells whose counts equal the values in the corresponding aggregate file for 100 sampled cells (exact equality). | Playwright + data fixture | FR-15 |
| AC-031 | Sum of B00–B08 counts equals the `all` value for every sampled cell, species and density. | Pipeline test + client unit | FR-15 |
| AC-032 | Play steps B00→B08 with a 1,500 ± 100 ms dwell; Esc pauses; at B08 Play stops. With `prefers-reduced-motion`, no cross-fade (transition duration 0). | Playwright with emulated media | FR-16, FR-32 |
| AC-033 | Effort strip is visible whenever a bin is selectable; hovering a bar shows the exact effort value that equals the aggregate sum for that bin. | Playwright | FR-17 |
| AC-034 | Normalised mode: for cells with effort < 30 the cell uses the hatched pattern and is excluded from legend min/max; for cells ≥ 30, the value equals species ÷ effort to 6 decimals. | Unit + visual regression | FR-18 |
| AC-035 | B08 label contains "partial" and a tooltip explaining incomplete data. | DOM test | FR-19 |
| AC-036 | A species with a curated record shows stages in `order`; a species without one shows exactly "No reviewed life-cycle record yet" and no stage UI. | Playwright with two fixtures | FR-20 |
| AC-037 | Durations appear as arc lengths only when `durationsComparable = true`; otherwise stages are equal-weight. | Unit | FR-20 |
| AC-038 | Lifespan block shows value, kind and ≥ 1 citation link; if any is missing, the block is not rendered. | Unit | FR-21 |
| AC-039 | Compare: two species in the same bin show two linked globes; camera changes on one reproduce on the other within one frame; Difference tab is disabled unless `normalised = true`. | Playwright | FR-24 |

## 4. Scientific integrity and trust

| ID | Criterion | Method | Reqs |
|---|---|---|---|
| AC-040 | **No unsourced number**: every numeric string rendered in panels, tooltips, legend and Ask answers is produced by a component that requires a `sourceId`; a static scan fails the build if a numeric literal is rendered without one (allowlist: pure UI labels such as "20 species"). | ESLint custom rule + runtime DOM check in E2E | FR-28 |
| AC-041 | The strings "extinct", "extinction", "vanished", "disappeared", "no longer lives", "lost from" never appear in the UI bundle or API responses except within (a) the classification chip for EX/EW, (b) the fixed `explain_data_limit` extinction paragraph. | Build-time grep over bundle + API contract test | SI-02, SI-03 |
| AC-042 | When any bin shows fewer records than the previous bin, the note uses "fewer records" and the effort series is on screen in the same view. | Playwright | SI-03 |
| AC-043 | No UI string uses "range", "distribution" or "habitat" to describe WildScope-computed shapes; allowed only with "IUCN" or "published" qualifiers. | Lint on copy files | SI-04 |
| AC-044 | Data notes lists: snapshot id, F1–F9 with drop counts from the manifest, licence filter, bias list (§11 of DATA_ARCHITECTURE). Numbers equal the manifest. | Playwright + manifest | FR-27 |
| AC-045 | Curated life-cycle files that lack a citation for any timing/lifespan value fail pipeline step 7. | pytest with a bad fixture | SI-05 |
| AC-046 | "Earliest record in snapshot" is the label for first-year values; the word "discovered" is absent. | Copy lint | SI-07 |
| AC-047 | Excluded record classes (fossil, living, geospatial issues, no year, non-open licence) are counted in the manifest and each count is non-negative and reconciles: raw = kept + Σ drops. | pytest | SI-08 |
| AC-048 | A species with zero records in a bin displays "No records in this bin" and never "absent", "none live", or an extinction term. | Playwright | SI-01 |
| AC-049 | Attributions for GBIF, IUCN (if used), Amazon Location, images and open-source licences are present in Data notes and README. | DOM + file check | NFR-09 |

## 5. Accessibility and responsive

| ID | Criterion | Method | Reqs |
|---|---|---|---|
| AC-050 | axe-core reports 0 serious/critical violations on every non-canvas screen state in the fixture list. | Playwright + axe | NFR-07 |
| AC-051 | Both data ramps remain ordered and distinguishable under simulated protanopia, deuteranopia and tritanopia: adjacent stops have ΔE (CIEDE2000, simulated) ≥ 10 and monotonic lightness. | Script on ramp tokens | DESIGN_SYSTEM §1.2 |
| AC-052 | All interactive controls are keyboard-reachable; the shortcut table in INTERACTION §13 works; focus visible with ≥ 3:1 contrast. | Playwright keyboard tests | NFR-07 |
| AC-053 | Table view provides the same figures as the Region summary and species cells-by-country in a navigable table. | Playwright | FR-29 |
| AC-054 | Layouts verified at 1440×900, 1024×768, 768×1024, 390×844: no horizontal scroll, panels never cover the timeline controls, touch targets ≥ 44 px. | Visual regression + DOM metrics | FR-30 |
| AC-055 | Canvas has an `aria-label` and a live region announcing lens/group/bin/region changes. | Unit + screen-reader smoke test (NVDA/VoiceOver) | NFR-07 |
| AC-056 | Text contrast ≥ 4.5:1 for all text tokens on panel backgrounds. | Script on tokens | DESIGN_SYSTEM §1.1 |
| AC-057 | With no WebGL2, the fallback page shows the message, links to Data notes, and passes axe. | Playwright with WebGL disabled | NFR-08 |

## 6. API and data contract tests

| ID | Criterion | Method | Reqs |
|---|---|---|---|
| AC-060 | Every A-0x asset validates against its JSON Schema or binary spec in the pipeline and again in CI on the published bucket. | pytest + CI job | NFR-12 |
| AC-061 | Re-running the pipeline with the same snapshot id yields identical content hashes in the manifest. | pytest | NFR-12 |
| AC-062 | 200 random cells and 200 random (species, cell, bin) values recomputed independently by SQL match published outputs exactly. | pytest | NFR-12 |
| AC-063 | E-03 returns exactly nine bins in order; `share` is `null` iff effort < `minEffort`. | contract test | API §4 |
| AC-064 | E-04 given a res-6 cell returns the res-4 parent; given res-2 returns 400 `use-finer-cell`. | contract test | API §5 |
| AC-065 | E-06 returns ≤ `limit` results, includes `attribution`, and sets `Cache-Control: no-store` if provider terms require (config). | contract test | API §7 |
| AC-066 | All endpoints return the error body shape in API §1 for 400/404/422/429/500. | contract test | API §1 |
| AC-067 | p95 latency under k6 load of 25 rps for 5 min: E-03, E-04 ≤ 600 ms; E-06 ≤ 800 ms; no 5xx. | k6 | NFR-04 |
| AC-068 | With the API entirely down (all `/api/*` return 503), the globe, density layers, timeline, search for species, Region summary from static fallback are usable and a non-blocking banner is shown. | Playwright with route stubs | NFR-04 |
| AC-069 | The Region summary can be served without E-04 for populated res-4 cells (reading A-05 directly) as a fallback. | Playwright | NFR-04 |

## 7. Ask (AI) criteria

| ID | Criterion | Method | Reqs |
|---|---|---|---|
| AC-080 | A set of 60 reference questions (30 supported, 15 ambiguous, 15 unsupported) yields: ≥ 90% correct intent for supported ones; 100% of unsupported ones return 422 with the intent list; 100% of ambiguous ones return `needs_clarification` or 422, never a guess. | Offline eval harness with recorded model outputs and a live smoke subset | FR-25, FR-26 |
| AC-081 | For every response, `answer` equals the template output computed from `computed` (the server recomputes; mismatch fails test). | Contract test | SI-06 |
| AC-082 | The model output is never returned or logged verbatim in `answer`; prompt-injection strings in `text` ("ignore previous instructions…") produce 422 or a valid intent but never alter system behaviour or leak the system prompt. | Red-team test list of ≥ 30 injection attempts | SI-06, NFR-05 |
| AC-083 | Athena queries issued by `ask` are drawn from the fixed template list; a fuzz test proves no user text reaches SQL (parameters match whitelists). | Unit + fuzz | API §9.2 |
| AC-084 | `ask` end-to-end p95 ≤ 8 s with cached static path, ≤ 20 s with Athena path; hard timeout 25 s with the "Your view is unchanged" error. | k6 | FR-25 |
| AC-085 | Undo restores the exact pre-answer state within 20 s. | Playwright | INTERACTION §9 |

## 8. Security, cost, operations

| ID | Criterion | Method | Reqs |
|---|---|---|---|
| AC-090 | All S3 buckets have Block Public Access enabled; direct S3 URL access returns 403; CloudFront paths work. | AWS Config rule / script | NFR-05 |
| AC-091 | Response headers include CSP, HSTS, X-Content-Type-Options, Referrer-Policy; CSP blocks inline script not nonce-hashed. | securityheaders-style test | NFR-05 |
| AC-092 | The only secret present in browser-visible files is the Amazon Location key restricted by referrer and actions; scanning the bundle and repo finds no other credentials. | gitleaks + bundle scan | NFR-05 |
| AC-093 | IAM roles for runtime Lambdas have no `s3:Put*`, no wildcard `Resource` on Bedrock/Athena, and Athena workgroup has the 1 GB scan cutoff. | IaC policy tests (cfn-guard) | AWS §4 |
| AC-094 | A Budgets alarm exists at 50/80/100% of the configured monthly ceiling, with notifications to an owner address. | CloudFormation assertion | NFR-10 |
| AC-095 | Setting the SSM parameter `AskEnabled=false` disables E-08 within 5 minutes and the UI hides Ask with an explanatory message. | Staging drill | AWS §8 |
| AC-096 | Logs for `ask` contain no request text; retention is as specified. | Log inspection test | NFR-06 |
| AC-097 | Application loads and runs without third-party requests other than the Amazon Location tile/style origin and the image sources of S05 (allowlist). | Playwright request log | NFR-06 |
| AC-098 | A full environment can be created from empty AWS account state with `make deploy ENV=<n>` plus the documented manual steps only. | Dry-run in a scratch account | NFR-12 |
| AC-099 | Observability: dashboard shows per-route p50/p95 latency, 4xx/5xx, throttles, Athena bytes scanned, Bedrock invocations; alarms exist for 5xx > 2% (5 min), daily Athena bytes and Bedrock invocations over thresholds; a synthetic check runs every 15 min. | CloudFormation assertion + staging drill | NFR-11 |

## 9. Traceability matrix

| Requirement | Acceptance criteria |
|---|---|
| FR-01 | AC-010 |
| FR-02 | AC-025 |
| FR-03 | AC-012 |
| FR-04 | AC-015 |
| FR-06 | AC-026 |
| FR-08 | AC-027 |
| FR-14 | AC-028 |
| FR-05 | AC-014 |
| FR-07 | AC-021 |
| FR-09 | AC-023, AC-024 |
| FR-10 | AC-016 |
| FR-11 | AC-017 |
| FR-12 | AC-018 |
| FR-13 | AC-019 |
| FR-15 | AC-030, AC-031 |
| FR-16 | AC-032 |
| FR-17 | AC-033 |
| FR-18 | AC-034 |
| FR-19 | AC-035 |
| FR-20 | AC-036, AC-037 |
| FR-21 | AC-038 |
| FR-22 | AC-022 |
| FR-23 | AC-020 |
| FR-24 | AC-039 |
| FR-25, FR-26 | AC-080–AC-085 |
| FR-27 | AC-044 |
| FR-28 | AC-040 |
| FR-29 | AC-053 |
| FR-30 | AC-054 |
| FR-31 | AC-068 (error states), AC-057 |
| FR-32 | AC-032 |
| NFR-01 | AC-010 |
| NFR-02 | AC-011 |
| NFR-03 | AC-013 |
| NFR-04 | AC-067–AC-069 |
| NFR-05 | AC-090–AC-093 |
| NFR-06 | AC-096, AC-097 |
| NFR-07 | AC-050, AC-052, AC-055 |
| NFR-08 | AC-057 |
| NFR-09 | AC-049 |
| NFR-10 | AC-094 |
| NFR-11 | AC-099 |
| NFR-12 | AC-060–AC-062, AC-098 |
| SI-01 | AC-048 |
| SI-02, SI-03 | AC-041, AC-042 |
| SI-04 | AC-043 |
| SI-05 | AC-045 |
| SI-06 | AC-081, AC-082 |
| SI-07 | AC-046 |
| SI-08 | AC-047 |

P2 requirements (FR-33–FR-37) have no acceptance criteria until promoted.
