# WildScope — Product Blueprint

WildScope is a Google Earth-inspired 3D globe for exploring **trees and animals**: where they have been *recorded*, how records change over time, and what is scientifically documented about their biology. This folder is a design and engineering blueprint. **Nothing is implemented yet.**

Blueprint version 1.0 · 2026-10-31

## 1. Documents

| # | File | What it settles |
|---|---|---|
| 1 | [PRODUCT_VISION.md](PRODUCT_VISION.md) | Purpose, audience, principles, the six knowledge categories (recorded occurrence, estimated distribution, lifespan, life-cycle stage, conservation classification, confirmed extinction) |
| 2 | [REQUIREMENTS.md](REQUIREMENTS.md) | FR/NFR/SI requirements with priorities P0/P1/P2 |
| 3 | [USER_JOURNEYS.md](USER_JOURNEYS.md) | Ten journeys with data needs and failure branches |
| 4 | [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Tokens, ramps, typography, components, layout, content style |
| 5 | [SCREEN_SPECIFICATIONS.md](SCREEN_SPECIFICATIONS.md) | S01–S10 layouts, component trees, states, responsive behaviour |
| 6 | [INTERACTION_SPECIFICATIONS.md](INTERACTION_SPECIFICATIONS.md) | State model, camera, selection, timeline, search, compare, ask, errors, shortcuts |
| 7 | [DATA_ARCHITECTURE.md](DATA_ARCHITECTURE.md) | Sources, filters, H3 grid, groups, bins, pipeline, file formats, limits, licensing |
| 8 | [API_CONTRACTS.md](API_CONTRACTS.md) | Static assets A-01…A-06 and endpoints E-01…E-08, intent catalogue |
| 9 | [AWS_ARCHITECTURE.md](AWS_ARCHITECTURE.md) | Services, request paths, security, CloudFormation layout, cost drivers |
| 10 | [ACCEPTANCE_CRITERIA.md](ACCEPTANCE_CRITERIA.md) | Measurable criteria AC-010…AC-098 with traceability |
| 11 | [TECHNICAL_ROADMAP.md](TECHNICAL_ROADMAP.md) | Contest cut, MVP plan, future, unresolved decisions, unsupported features, handoff checklist |
| 12 | README.md | This index |

Read order for engineers: 1 → 2 → 7 → 9 → 8 → 5 → 6 → 4 → 10 → 11. For designers: 1 → 3 → 4 → 5 → 6.

## 2. Product in five sentences

1. A full-screen CesiumJS globe shows H3-hexagon density of recorded occurrences for **Trees** or **Animals**.
2. Level of detail follows camera height (res 2 → 4 → 6).
3. Picking a species turns the globe into that species' record map; a nine-bin timeline re-renders real aggregates and always shows sampling effort beside them.
4. A reviewed, cited life-cycle view exists only for curated species; every other species honestly says so.
5. An Ask interface turns a question into one of eight fixed intents and answers with templated sentences filled from computed numbers — the AI never writes biology.

## 3. Key decisions already made

- Static-first: the globe hot path uses only cached files on CloudFront; Lambda/Athena/Bedrock serve secondary features.
- Records ≠ presence/absence: no wording implies absence, decline in animals, or extinction from missing records.
- Extinction language only from an IUCN EX/EW classification.
- Licence filter: CC0 and CC BY records only.
- No estimated distributions, abundance, or seasonal inference in MVP.

## 4. Where things are uncertain

See TECHNICAL_ROADMAP §5 (UD-01…UD-15). The three that can change the plan most:
- **UD-02** Amazon Location basemap inside CesiumJS.
- **UD-03** Rendering ~10⁵ cells fast enough on integrated GPUs.
- **UD-04** Which species count as "trees" and under what licence.

## 5. Consistency review results

Performed on 2026-10-31 (script + reading). Corrections applied are listed so reviewers can see what changed.

Method: a script resolved every referenced identifier (FR, NFR, SI, AC, UD, UN, S, A, E) against its definition, compared repeated constants across files, and checked that every P0/P1 requirement has a traceability row.

Result after fixes: **0 unresolved references**; every P0/P1 requirement maps to at least one acceptance criterion.

Problems found and fixed:
1. Four P0/P1 requirements (FR-02 camera, FR-06 group filter, FR-08 legend, FR-14 image) and NFR-11 had no acceptance criteria → added AC-025–AC-028 and AC-099.
2. Conservation wording promised an IUCN assessment year for every species, which the GBIF-field option may not supply → year is shown "when the source provides it" in PRODUCT_VISION, REQUIREMENTS (FR-13, SI-02), DESIGN_SYSTEM, SCREEN_SPECIFICATIONS and DATA_ARCHITECTURE (UN-08).
3. Region summary at L0 conflicted with API E-04 (res-2 cells are rejected) → SCREEN_SPECIFICATIONS S02 now states totals-only at L0.
4. "P0 = contest cut" conflicted with a contest list containing P1 stretch items → TECHNICAL_ROADMAP §2 now lists which P0 items are relaxed and which rows are P1 stretch.
5. A malformed tolerance in AC-017 and a stray "UD-05b" reference were corrected.
6. The contest deadline conversion was corrected to 02:00 PKT on Tuesday, November 3, because US daylight saving time ends on November 1, 2026 (verify on the official page).

Constants verified identical across files: nine bins B00–B08; H3 resolutions 2/4/6; LOD thresholds 8,000 km and 2,000 km; `MIN_EFFORT` 30; `MIN_SPECIES_RECORDS` 100; uncertainty thresholds 10,000 m (res 2/4) and 2,000 m (res 6).

Not verifiable from here (marked as decisions, not facts): ~~the exact GBIF bucket path and column names (UD-01)~~ (verified 2026-10-31, DATA_ARCHITECTURE §14), Amazon Location basemap compatibility with CesiumJS (UD-02), IUCN and tree-list licences (UD-04, UD-05), current AWS list prices (AWS_ARCHITECTURE §8).

## 6. Attributions and licences (summary)

GBIF occurrence data (CC0/CC BY records only) · IUCN Red List (terms apply) · Amazon Location Service · H3 (Apache-2.0) · DuckDB (MIT) · CesiumJS (Apache-2.0) · React (MIT) · Fraunces, Inter, JetBrains Mono (SIL OFL). Full list in DATA_ARCHITECTURE §13.

## 7. Contributing to the blueprint

- Change a constant → change every file that states it (search the constant) and note it in the changelog below.
- Add a requirement → add acceptance criteria and a trace row.
- Never add statistics to documents unless they come from the build manifest or a cited source.

### Changelog
- 1.0 (2026-10-31): first complete blueprint.
- 1.1 (2026-10-31): step-0 verification against snapshot 2026-10-01 (UD-01 closed): bucket path, absent columns, alphanumeric species keys, Teleostei, names source — see DATA_ARCHITECTURE §14.
