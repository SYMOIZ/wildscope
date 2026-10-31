# WildScope — Technical Roadmap and Pre-Handoff Review

## 1. Planning assumptions

- Stack: React + TypeScript (Vite), CesiumJS, Python 3.12, DuckDB, H3, S3, Athena, Lambda, API Gateway (HTTP API), Bedrock, CloudFront, CloudFormation.
- One snapshot per release; static-first architecture; dynamic API is optional for core exploration.
- Team assumption for estimates: **one full-stack developer** working with AI assistance. If the team is larger, the critical path is the data pipeline, not the UI.
- Effort estimates are rough ranges for planning only.

## 2. Contest cut (P0 subset) — AWS Builder Center "Weekend Challenge: Map it"

Deadline stated in the challenge text: **Monday, November 2, 1:00 PM PT**. US daylight saving time ends on Sunday, November 1, 2026, so Monday is Pacific Standard Time (UTC−8): that is **Tuesday, November 3, 02:00 PKT (UTC+5)**. Verify on the official page and treat Monday night PKT as the practical deadline for buffer. (An earlier chat message said 1:00 AM PKT; the correct conversion after the DST change is 02:00 PKT.)

Submission checklist (from the challenge): dataset description · how it is placed on the map and which AWS location/data service and why · at least one AWS service in the app/pipeline · live link · public code repo (optional, recommended) · demo video < 3 min in the "demo" field · previously unpublished work · eligibility (18+, Builder Center profile, rules on exclusions).

Scope for the contest cut — hard-prioritised, with explicit cut lines. P0 is the intended contest scope. Under time pressure these P0 items are **explicitly relaxed**: FR-03 (L2 deferred; FR-22 is then satisfied by capping at L1), FR-30 (phone layout functional but not fully polished), FR-31 (one global error banner instead of per-block states), NFR-10 (budget alarm created; ceiling set manually). Rows 9–14 below are P1 stretch items, in the order they are dropped if time runs out.

| Order | Item | Reqs | Est. | Cut line |
|---|---|---|---|---|
| 1 | Pipeline steps 0–4, 8–10 on **Animals only**, L0 + L1 | NFR-12, DATA §7 | 10–14 h | Keep |
| 2 | Cesium globe + density layer + legend + lens switch (Trees limited to a **curated list v1**, if UD-04 unresolved) | FR-01–06, FR-08 | 8–10 h | Keep |
| 3 | Species search (static index), species mode, species panel without media | FR-10–12 | 5–6 h | Keep |
| 4 | Timeline with 9 bins + effort strip + normalised mode | FR-15–18 | 5–6 h | Keep (scientific honesty) |
| 5 | Geographic search via Amazon Location (Lambda + API Gateway) + visible basemap use | FR-23 | 3–4 h | Keep (contest requirement) |
| 6 | Data notes + provenance + share URL | FR-09, FR-27, FR-28 | 3–4 h | Keep |
| 7 | CloudFormation deploy (S3, CloudFront, API, Lambda) | AWS §6 | 4–5 h | Keep |
| 8 | Demo video, write-up, README, repo | contest | 4–5 h | Keep |
| 9 | Region summary from static A-05 | FR-07 | 3 h | Cut 1st if late |
| 10 | Conservation chip (GBIF field only; year omitted) | FR-13 | 2 h | Cut 2nd |
| 11 | Life-cycle for ~5 curated species | FR-20 | 6–8 h | Cut 3rd (needs research time) |
| 12 | L2 (res 6) | FR-03 | 5 h | **Ship L0/L1 only** — which also satisfies FR-22 trivially |
| 13 | Ask (Bedrock) with 4 intents | FR-25 | 6 h | Cut 4th |
| 14 | Compare (species vs species) | FR-24 | 5 h | Cut 5th |

Total of "Keep" items ≈ 42–54 h of focused work against ≈ 60 h of calendar time remaining at the time this was written, so it is **tight**. Pipeline data volume is the main risk: do a one-country slice first, then scale.

What the contest judges can see in under three minutes: the live globe, species selection, timeline scrub with the effort strip, a place search, and a written statement of limitations. Keep the video script to those moments.

## 3. MVP plan (P0 + P1), after the contest

| Phase | Duration | Deliverables | Exit criteria |
|---|---|---|---|
| M0 Foundations | 1 week | Repo, CI, infra skeleton, schemas, design tokens, step-0 verification of sources, decisions UD-01…UD-05 closed | Schemas merged; a dev snapshot builds end-to-end |
| M1 Data | 2 weeks | Pipeline steps 0–10 for both lenses, manifest, tests AC-060–AC-062, tree list integration | Full snapshot published to a staging bucket; AC-060–062 pass |
| M2 Globe core | 2 weeks | S01, S02, S03, S04, Legend, LOD logic, share URL, Data notes | AC-010–015, AC-023–024, AC-044 |
| M3 Species and time | 2 weeks | S05, S06, search (S08), species mode, effort/normalised | AC-016–019, AC-030–035, AC-040–043 |
| M4 Biology | 2 weeks (parallel curation) | S07, curated records, review workflow, conservation data | AC-036–038, AC-045 |
| M5 Compare and Ask | 2 weeks | S10, S09, Bedrock integration, Athena templates | AC-039, AC-080–085 |
| M6 Hardening | 1–2 weeks | Accessibility, performance, security, cost alarms, load tests, documentation | AC-050–057, AC-067–068, AC-090–098 |
| M7 Beta | 1 week | Small public beta, feedback triage, data-notes review by a domain scientist | No open P0 defects |

## 4. Future (P2), gated by decisions

| Item | Gate |
|---|---|
| Estimated distributions (FR-33) | Licence for expert range data (part of UD-05) |
| Larger curated life-cycle coverage (FR-34) | Reviewed ingestion pipeline and funded curation |
| Forest/land-cover context (FR-35) | Dataset choice and licence |
| Terrain (FR-36) | Terrain source without ion lock-in |
| Accounts, saved collections, offline (FR-37) | Product need; privacy review |
| Seasonal analysis of records | Effort-corrected method reviewed by a statistician |
| Additional languages | Translation source and review |

## 5. Unresolved technical decisions

| ID | Decision | Options | Needed by | Default if undecided |
|---|---|---|---|---|
| UD-01 | Exact GBIF snapshot path, schema and enumerations (`license`, `basisofrecord`, `occurrencestatus`, `datageneralizations`, uncertainty fields) | Verify in pipeline step 0 | Day 1 | Fail build until verified |
| UD-02 | **How Amazon Location basemap integrates with CesiumJS** (raster tile endpoint, vector style to imagery, or geocoding-only) and CloudFormation support for current Location resources | PoC in 2 h: attempt `UrlTemplateImageryProvider` with Location raster/satellite style; else neutral open imagery + Location for geocoding + visible Location-powered 2D mini-map | Day 1 | Neutral imagery + Location Places; visible place search; check contest rules |
| UD-03 | **Rendering approach for density cells**: batched polygon primitives vs generated canvas imagery layer vs a custom WebGL layer; worker-based preparation | PoC with 150k cells at L1 on reference laptop, measure fps | Before M2 | Imagery-layer approach if polygons < 30 fps |
| UD-04 | **Tree list source and licence** (BGCI GlobalTreeSearch vs curated list) | Request permission; else curated list with citations; Trees lens states list scope | Before M1 | Curated list v1, labelled |
| UD-05 | **IUCN data access and redistribution** (GBIF field vs API token; assessment year; EX/EW handling; and, separately, IUCN spatial range data) | Register for API; read terms; ask permission if needed | Before M4 | GBIF category field only; no year |
| UD-06 | Initial curated life-cycle set (which species, who reviews) | 10–20 species across groups incl. 3 trees; second reviewer required | Before M4 | 5 species for the contest |
| UD-07 | Build compute (EC2 size, Fargate, or Athena CTAS) and runtime | Measure on dev snapshot | M1 | Single memory-optimised EC2 in us-east-1 |
| UD-08 | GBIF citation mechanics for derived aggregates | Cite snapshot + registry entry; or GBIF derived dataset DOI | M1 | Registry citation + snapshot id |
| UD-09 | Image hot-linking vs caching, and license-compatible sources | Hot-link with attribution; cache only if terms allow | M3 | Hot-link |
| UD-10 | Amazon Location Places data-provider attribution and caching terms | Read current service terms | M3 | `no-store` for geocoding results; show attribution |
| UD-11 | Bedrock model and region; Guardrails usage | Choose a model available in the build region with JSON-mode reliability; cost check | M5 | Smallest capable model, temperature 0 |
| UD-12 | WAF, CloudFront logging, data retention | Trade privacy vs abuse protection | M6 | No WAF initially; reserved concurrency + throttling; logs 14 days |
| UD-13 | Number of species files published and `MIN_SPECIES_RECORDS` (default 100) | Measure counts in step 4 | M1 | Keep default; cap to top N by records if bucket/object counts become costly |
| UD-14 | Region summary at r6 uses r4 parent (design choice) | Alternative: r6 summaries via Athena | M2 | r4 parent |
| UD-15 | Handling of `occurrencestatus` null and GBIF issue flags beyond `hasgeospatialissues` | Decide after step-0 inventory | M1 | Exclude null status |

## 6. Features that cannot be supported by the data available

Same identifiers as DATA_ARCHITECTURE §12.

| ID | Feature | Reason | MVP behaviour |
|---|---|---|---|
| UN-01 | Estimated geographic distribution | No openly licensed global range data | Not shown |
| UN-02 | Population size/abundance | Records are not counts | Not shown |
| UN-03 | "Vanished from region" | Needs absence data and effort modelling | Only "fewer records" with effort |
| UN-04 | Life cycle for all species | No open structured source | Curated set |
| UN-05 | Seasonal/migration maps from dates | Observer seasonality bias | Not shown |
| UN-06 | Forest extent | Different data | P2 |
| UN-07 | Terrain | Needs terrain source | P2 |
| UN-08 | IUCN assessment year universally | GBIF field lacks year | Year when provided |
| UN-09 | Real-time sightings | Snapshot-based | Not offered |

## 7. MVP vs future summary

| Group | In MVP | In future |
|---|---|---|
| Globe | LOD density, lens, group, legend, share URL, camera, table view | Terrain, land cover |
| Species | Search, mode, detail, conservation chip, media | Ranges |
| Time | 9 bins, effort strip, normalised mode, play | Seasonal analysis |
| Biology | Curated life-cycle + lifespan (small set) | Broad coverage |
| Search | Places (Amazon Location) + species | Multi-language |
| Compare | Species/bins/regions | Saved comparisons |
| Ask | 8 intents, templated answers | Broader intent set after eval |
| Platform | Static-first AWS stack | Accounts, offline |

## 8. Consistency review (performed before handoff)

Checked by script and by reading; results recorded in README §5 with fixes applied.

Checklist used:
1. Identifier sets: FR/NFR/SI, S01–S10, E-01…E-09, A-01…A-06, AC-xxx, UD-xx, UN-xx — every reference resolves to a definition.
2. Constants: bins B00–B08, H3 resolutions 2/4/6, camera thresholds 8,000/2,000 km, `MIN_EFFORT` 30, `MIN_SPECIES_RECORDS` 100, uncertainty thresholds 10,000/2,000 m, nine bins.
3. Vocabulary: "recorded occurrence", "conservation classification", "confirmed extinction" etc. consistent with PRODUCT_VISION §6.
4. Services in AWS_ARCHITECTURE match endpoints in API_CONTRACTS and data assets in DATA_ARCHITECTURE.
5. Every requirement has acceptance criteria (ACCEPTANCE_CRITERIA §9) except P2.

## 9. Final implementation handoff checklist

Before engineering starts
- [ ] Read all 12 documents; open questions logged against UD-xx
- [ ] Close or default UD-01, UD-02, UD-03, UD-04, UD-05, UD-07
- [ ] AWS account(s), budgets and alarms (NFR-10) in place
- [ ] Amazon Location terms read (UD-10); API key plan documented
- [ ] Bedrock model access requested in the target region (UD-11)
- [ ] IUCN registration/terms handled (UD-05)
- [ ] Tree list permission requested (UD-04)
- [ ] Reviewer identified for curated life-cycle records (UD-06)

Definition of ready for each ticket
- [ ] Linked FR/NFR/SI id; linked AC id(s); screen id(s)
- [ ] Design tokens used; states (loading/empty/partial/error) specified
- [ ] Data assets and endpoints named by id

Definition of done
- [ ] Unit + integration + E2E tests for linked ACs pass
- [ ] axe clean; keyboard path verified
- [ ] No unsourced numbers (AC-040); wording lint passes (AC-041, AC-043, AC-046)
- [ ] Data notes updated when filters/data change
- [ ] Docs updated if constants changed

Release
- [ ] Pipeline step 9 report attached
- [ ] Load test and cost projection recorded
- [ ] Attributions verified (AC-049)
- [ ] Rollback tested (AWS §9)
- [ ] Domain scientist reviewed Data notes and copy
