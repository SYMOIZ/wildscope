# WildScope — User Journeys

Each journey lists steps, the screens (S01–S10) touched, the data each step needs, failure branches and the requirement IDs it exercises. Timings are design targets, not measurements.

## J1 — First arrival, pick a lens (S01 → S02 → S03/S04)

Persona: curious explorer. Entry: direct link or share.

| # | User does | System does | Data | Reqs |
|---|---|---|---|---|
| 1 | Opens site | Renders globe at L0 with the Animals lens preselected, slow auto-rotation (disabled when reduced motion) | L0 file for animals | FR-01, FR-04 |
| 2 | Reads one-line title overlay: "Where life has been recorded." | Overlay fades on first input or after 6 s | — | FR-01 |
| 3 | Clicks **Trees** | Colour ramp swaps, group filter updates, legend rescales | L0 file for trees | FR-05 |
| 4 | Drags and zooms to a region | LOD switches L0→L1 at 8,000 km | L1 file for trees | FR-03 |
| 5 | Hovers a cell | Tooltip: record count, bin, "recorded occurrences" | in-memory | FR-04 |

Failure branches: WebGL2 unavailable → static explanation + link to data notes; L1 file fails → remain at L0 with an inline retry chip.

## J2 — From a region to a species (S02 → S05)

1. User clicks a cell over a country they know.
2. Right panel opens (**Region summary**): total records in the bin, effort, top 20 species by records, each with group and record count.
3. User selects the first species. Camera flies to the species' trimmed record extent; globe changes to species mode.
4. Detail panel shows taxonomy, vernacular names, earliest/latest record years, conservation chip (if matched), licence mix.
5. User opens "Data notes" and sees the snapshot date and filters.

Branches: species has < 100 qualifying records → panel states "Few qualifying records (n)" and disables L2; IUCN match missing → chip text "Not in the IUCN data used".

## J3 — Reading history responsibly (S05 → S06)

1. With a species selected, user scrubs the timeline from B03 (1970–79) to B07 (2010–19).
2. The layer re-renders with each bin's aggregates; the effort strip underneath shows record volume by bin for the whole lens/group.
3. User sees the species' cells shrink between B06 and B07. The headline note reads "Fewer records in 2010–19 than 2000–09 (n₁ → n₂). Overall effort rose/fell by x%." (templated).
4. User toggles **Effort-normalised**. The layer now shows share of records and hatches low-effort cells.
5. User presses Play; bins step with a 1.5 s dwell.

Safeguards: no "extinct"/"vanished" wording; B08 labelled partial; if the species has zero records in a bin, the bin shows "No records in this bin" and the effort strip remains.

## J4 — Life cycle (S05 → S07)

1. User opens a species that has a curated life-cycle record (list of curated species is visible in the Life filter on S05).
2. Life-cycle screen shows an ordered stage rail. Selecting a stage shows its description, timing if cited, and citation.
3. If the species has seasonal patterns documented in the record (e.g. a documented migration phase), they appear as a stage annotation with citation. WildScope does not infer seasonality from occurrence dates.
4. A lifespan block shows value + kind + citation.
5. "Back to globe" returns to the species mode with the previous camera.

Branch: species without a record → "No reviewed life-cycle record yet" and a link to the species' GBIF page; the globe stays one tap away.

## J5 — Searching by place (S08 → S02)

1. User presses `/` or taps search; types "Amazon" and picks a place result from Amazon Location Service.
2. Camera flies to the place bounds; the cell under the centre opens the region summary.
3. User can switch lens inside the panel; top species list updates.

Branch: no result → "No place found. Try a country or city." Location service error → fall back to species-only search, show a non-blocking banner.

## J6 — Compare (S05 → S10)

Variant A — two species: user taps **Compare**, picks a second species via search; split view shows both on linked globes, same bin, same ramp; summary table lists record totals, earliest/latest year, shared cell count.

Variant B — one species, two bins: user picks bins; difference layer (normalised mode only) shows cells where share rose/fell beyond a stated threshold (defaults documented in SCREEN_SPECIFICATIONS S10); legend explains that differences reflect records, not abundance.

Variant C — two regions: user picks two cells (or places) and sees ranked species lists side-by-side with overlap count.

Branches: normalised mode unavailable for cells with effort < 30 (hatched); same species selected twice → inline validation.

## J7 — Ask (S09)

1. User opens Ask and types: "Which birds were recorded most around Lake Victoria in the 1990s?"
2. The system resolves the place via Amazon Location, maps the question to intent `top_species_in_region` with params `{lens: animals, group: birds, place, bin: B05}`, runs it, and shows a templated answer plus the globe state.
3. "How this was computed" expands to show intent, parameters, data snapshot, and counts.
4. User asks "Are lions extinct?" → intent `explain_data_limit` or `show_species` + conservation fact from IUCN; the answer quotes the IUCN category and year only. If the species has no IUCN match, the answer says that explicitly.
5. User asks "What will the tiger population be in 2050?" → not supported; the interface lists supported question types.

## J8 — Share and re-open (all)

1. User copies the URL from the share control.
2. Recipient opens it; the arrival sequence is skipped; the globe appears at the exact camera, lens, group, species, bin and mode.
3. If the snapshot has changed since the link was made, a banner states the data version used by the link if still available, or notes the newer snapshot.

## J9 — Hitting data limits (all)

1. User zooms to a small island where few records exist.
2. Region summary shows low effort; the panel offers "Show effort for this region", which colours cells by lens/group effort rather than species.
3. Language is fixed to "Few records" rather than "few animals".

## J10 — Phone

1. Phone user sees globe, lens switch, search, timeline scrubber at the bottom.
2. Taps a cell; bottom sheet at 40% height shows the region summary; drag up to 90%.
3. Compare and Ask are single-column; split-globes become stacked tabs.

## Journey-to-requirement coverage

| Journey | Covers |
|---|---|
| J1 | FR-01–06, FR-08 |
| J2 | FR-07, FR-10–14 |
| J3 | FR-15–19, SI-01–03 |
| J4 | FR-20, FR-21 |
| J5 | FR-23 |
| J6 | FR-24 |
| J7 | FR-25, FR-26, SI-06 |
| J8 | FR-09 |
| J9 | FR-27, SI-01 |
| J10 | FR-30 |
