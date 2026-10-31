# WildScope — Screen Specifications

Conventions: components are named as in DESIGN_SYSTEM §3. States: **Loading**, **Empty**, **Partial** (some data missing), **Error**. Responsive columns: D = desktop ≥ 1024, T = tablet 640–1023, P = phone < 640. IDs of data endpoints (E-xx) and static assets (A-xx) are defined in API_CONTRACTS.md.

## Screen map and navigation rules

```
S01 Landing ──(skip/auto 3 s)──► S02 Globe (Explore)
S02 ◄──► S03 Trees lens / S04 Animals lens   (same screen, different lens state)
S02 ──cell click──► Region summary panel ──species click──► S05 Species detail
S05 ──► S06 Timeline (docked; expand for full view)
S05 ──► S07 Life cycle (full-height panel)
S02/any ──/──► S08 Geographic & species search
S02/any ──► S09 Ask
S05 / Region summary ──► S10 Compare
```

Rules: one context panel at a time; opening another replaces it and records the previous panel in a back stack (max 5); `Esc` closes the panel; browser Back follows the back stack (URL state changes push history only for species, lens, panel and compare changes, not camera moves, which use `replaceState`).

---

## S01 — Landing (arrival sequence)

**Purpose**: orient in under 6 seconds without gating the product.

**Layout**: S02's globe fills the screen at L0, camera at 20,000 km. Over it, centred-left on D (bottom-centre on P): title "Where life has been recorded." (Fraunces 3.5 rem), one supporting line "Trees and animals across the planet, from open biodiversity records.", and two text buttons: **Begin** and **Take the 25-second tour**.

**Components**: Globe, Title block, Lens switch (visible, disabled until arrival ends), Skip link.

**Visual states**
- Arrival (0–3 s): camera descends from 20,000 km to 12,000 km while rotating; title visible.
- Settled: title fades to 0 over 480 ms; chrome appears.

**Interactions**: any pointer/key input skips to Settled; `Begin` = skip; Tour = guided sequence (3 stops, §S02 Tour).

**Responsive**: P stacks title above buttons at bottom; font sizes 2.25 rem.

**Loading**: before L0 data arrives, globe shows imagery only and a 2 px progress line under the top bar; title still shows. **Error**: if L0 fails after 8 s, a banner "Could not load the record density layer. Retry" appears; imagery stays interactive. **No WebGL2**: full-page message "WildScope needs WebGL2" with a link to the Data notes and a still image placeholder (the only static image in the product).

---

## S02 — Full-screen 3D globe (Explore)

**Purpose**: primary experience. Everything else hangs off this.

**Layout**: see DESIGN_SYSTEM §4.

**Component hierarchy**
```
AppShell
 ├─ TopBar: Wordmark · LensSwitch · SearchInput · AskButton · InfoButton(Data notes)
 ├─ GroupRail
 ├─ GlobeCanvas (CesiumJS viewer)
 │    ├─ DensityLayer (cells, LOD-aware)
 │    ├─ SpeciesLayer (when a species is selected)
 │    ├─ SelectionOutline
 │    └─ SearchPin
 ├─ Legend
 ├─ CameraControls (reset north, zoom in/out, tilt reset)
 ├─ Timeline (S06, docked)
 └─ ContextPanel (Region summary | S05 | S07 | S09 | S10)
```

**Visual states**
1. *Density mode* (default): cells for active lens/group/bin.
2. *Species mode*: only that species' cells; other cells removed (not dimmed) to keep the figure readable; a small label "Species: *Name*" appears in the top bar with an ✕ to leave.
3. *Effort mode*: user toggle in the Legend: shows lens/group effort instead of species counts (diagnostic).
4. *Normalised overlay*: FR-18; hatched insufficient-effort cells.
5. *Hover*: cell outline `bone-100` 1 px + tooltip (record count, bin, effort).
6. *Selected*: `focus` outline + Region summary panel open.

**Region summary panel** (right panel body)
- Header: place label (reverse lookup via Amazon Location when online, else "Cell <H3 id short>") and lens/group chips.
- Block 1: "Recorded occurrences in <bin>: *n*" (mono), "Whole-lens effort: *m*", "Species with records: *k*".
- Block 2: ranked list of top 20 species (name, group, records). Row click → S05.
- Footer: provenance line, "Table view" button, "Compare region" button.
- At L0 (res-2 cells) the panel shows only totals and effort (from A-02) with the line "Zoom in for a species list"; the species list needs a res-4 cell (E-04 returns 400 `use-finer-cell` for res 2). At L1/L2 the panel describes the res-4 parent cell and states its approximate area.

**Interactions**: INTERACTION_SPECIFICATIONS §2 (camera), §3 (selection), §4 (lens/group), §5 (bin).

**Tour** (25 s, skippable): stop 1 — Animals, All, "All years", global; stop 2 — Trees, one L1 region with highest density in the bin; stop 3 — a species from the curated life-cycle list. Stops are generated from the manifest (the highest-density cell is computed in the data build), not hard-coded numbers.

**Loading**: skeleton hex pattern is not used; instead the globe shows previous layer at 40% while the new one loads, with the progress line. **Empty**: if the selected group has zero qualifying records in the bin, layer empty; a notice in the Legend: "No records in this bin for this selection." **Partial**: if L2 shard missing, stay at L1 with a chip "Detailed cells unavailable here". **Error**: top-centre banner with Retry; the last good layer remains.

**Responsive**: T/P replace GroupRail with menu; ContextPanel becomes bottom sheet; CameraControls shrink to reset-north only on P.

---

## S03 — Trees exploration (lens state of S02)

**Differences from default**
- Ramp: Trees. Groups: All · Conifers · Flowering trees (Magnoliopsida) · Palms · Other trees (definitions DATA_ARCHITECTURE §5.2).
- Search results restricted to tree list v1; the note "Tree list v1: *N* species" with a link to the list's provenance sits in Data notes.
- Region summary shows species names with family.
- No forest-cover layer in MVP (FR-35, P2). The Data notes states that occurrence of tree species is not forest extent.

**States specific to Trees**: Empty groups at a given LOD show the group disabled with tooltip "No qualifying records".

---

## S04 — Animals exploration (lens state of S02)

- Ramp: Animals. Groups: All · Mammals · Birds · Reptiles · Amphibians · Fishes · Insects · Other invertebrates.
- Group "Fishes" combines classes defined in DATA_ARCHITECTURE §5.1.
- Marine records appear on the globe where coordinates exist; imagery shows ocean; no special treatment.
- Sensitive-species rule (FR-22) shown as a chip on species rows: "Location generalised".

---

## S05 — Species detail

**Purpose**: identity, records, classification, entry to time/life/compare.

**Layout** (right panel, scrollable, 380 px D; sheet on T/P)

1. **Header**: scientific name (italic, 2.25 rem), accepted-name status line, common names (up to 3 with language tags; "+n more").
2. **Image block**: one image with attribution, or typographic placeholder (initial letter of genus). No stock illustrations.
3. **Records block**: total records (mono), earliest/latest record year ("Earliest record in snapshot: 1912"), licence mix (CC0 x%, CC BY y%), countries with records (top 5; link to Table view).
4. **Conservation classification**: chip + assessing body + year (only when the source provides it) + link; if absent "Not in the IUCN data used".
5. **Lifespan**: block present only when curated (value, kind, citation).
6. **Actions**: *Show on globe* (already on), *Timeline* (scrolls bottom bar into focus), *Life cycle* (opens S07 if record exists, otherwise disabled with reason), *Compare*, *Share view*.
7. **Taxonomy**: kingdom → … → species chain (links to GBIF).
8. Footer: provenance line.

**Visual states**: Loading — header skeleton lines (3), blocks load progressively (names/records from A-03 first, IUCN second, curated third). Empty sections omit themselves silently except conservation (explicit text). Error — block-level inline "Could not load <block>. Retry"; panel remains usable.

**Conservation wording rules** (enforced in code): category text from IUCN controlled vocabulary; EX/EW chip text begins "Assessed by IUCN as Extinct (EX)" followed by the year when provided; DD shown as "Data Deficient", NE only when IUCN returns it. No colour semantics.

---

## S06 — Historical timeline

**Purpose**: change the actual data being rendered by bin.

**Layout**: docked bottom bar, 88 px (D): left Play/Pause; centre scrubber with nine ticks; above ticks the effort strip (9 thin bars, height ∝ log effort for current lens/group); right "Effort-normalised" toggle and "All years" button. Selected bin label in mono above the handle.

**Expanded view** (button ⌃): bar grows to 220 px showing, when a species is selected, a second series of bars for the species' record counts per bin aligned with the effort bars, with values on hover; below, the templated note (SI-03).

**States**: Loading — ticks visible, bars empty with indeterminate shimmer only on bars (not on ticks); Empty bin — tick shows hollow marker; note "No records in this bin"; Partial — B08 striped with tooltip "Partial bin"; Error — bars hidden, ticks still selectable (layer rendering falls back to "All years" if bin files fail, with banner).

**Responsive**: P shows nine dots + selected bin label; expanded view is a sheet.

---

## S07 — Life-cycle visualisation

**Purpose**: stage-by-stage biology, only for curated, cited species.

**Layout**: full-height right panel (D) / full-screen sheet (T/P).
- Header: species name + "Reviewed life-cycle record" with reviewer initials and review date (mono).
- **Stage rail**: ordered stages as numbered text buttons (e.g. 1 Egg · 2 Larva · 3 Pupa · 4 Adult for holometabolous insects; for trees: Seed · Germination · Seedling · Sapling · Mature tree · Seed production, where applicable and cited). The stage set is taken from the record, not a template.
- **Stage detail**: description paragraph, "Timing" (value + conditions + citation) *only if cited*, "Notes" (e.g. documented migration phase) with citation.
- **Diagram**: an SVG ring or linear diagram generated from the stage list (equal-weight stages, because durations are not always known; durations are never encoded as arc lengths unless every stage has a cited duration under comparable conditions — the record has a boolean `durationsComparable`).
- **Lifespan block** (if present).
- **Sources**: numbered citations list at the bottom, each with link/DOI.

**States**: Loading skeleton of the rail; Empty (no record) — "No reviewed life-cycle record yet" + link; Error — retry. Never show a template life cycle for a species without a record.

**Responsive**: rail wraps to a vertical list on P.

---

## S08 — Geographic search and species search

**Purpose**: one input for places and species.

**Layout**: SearchInput expands to a 520 px listbox under the top bar (D) / full-screen overlay (P).
- Sections: **Places** (Amazon Location results, max 5), **Species** (local index, max 8), **Recent** (session only).
- Result row: name · type · short descriptor (country; or group + record count).

**Behaviour**: place chosen → fly-to bounds, SearchPin, Region summary opens at the target cell. Species chosen → S05.

**States**: Loading — inline spinner in input; Empty — "No places or species match. Try a country, city, or scientific name."; Partial — only species results with "Place search unavailable"; Error — same as Partial plus Retry.

---

## S09 — AI exploration ("Ask WildScope")

**Purpose**: translate a question into the operations the UI already has. Not a chat product.

**Layout**: right panel with (1) a single-line textarea at the top, submit with `Enter`; (2) *Three runnable examples* as text links; (3) result area: **Answer** (templated sentence(s) with figures), **Applied view** (what changed on the globe, with Undo), **How this was computed** (intent, parameters, snapshot, counts) collapsed by default; no avatar, no bubbles, no conversation history beyond the last three asks in the session.

**States**: Loading — "Interpreting…" in the answer area (max 6 s then timeout); Empty — examples visible; Unsupported — "I can answer questions of these kinds:" + the intent list + examples; Ambiguous place or species — a disambiguation list (up to 5) before running; Error — "Could not run this question. Your view is unchanged."

**Rules**: text from the model is parsed to JSON validated against the intent schema; invalid → Unsupported. The answer string is produced by templates. SI-06 enforced by test.

**Responsive**: same single column on all sizes; on P it is a sheet.

---

## S10 — Comparison

**Purpose**: structured comparison without leaving the globe.

**Layout (D)**: ContextPanel widens to 520 px; the canvas splits vertically into two linked globes (camera locked together; toggle unlock). Left globe = A, right = B. Each has a header strip (species/bin/region label). Panel body: selectors (A, B), comparison table, and notes.

**Variants** (JOURNEY J6): (a) two species, same bin; (b) one species, two bins (adds a Difference tab; only available in normalised mode; threshold default: |Δshare| ≥ 5 percentage points of the species' own total cell records, with both cells having effort ≥ 30); (c) two regions.

**Comparison table rows**: total records, earliest/latest record year, cells with records (at current LOD), cells shared, top shared countries (a, b). Every number has a source id.

**States**: Loading — each globe loads independently; Empty — if a selection has no records in the bin, that side shows "No records in this bin"; Error — one-side retry; Partial — difference layer disabled with the reason "needs effort-normalised mode and sufficient effort".

**Responsive**: T stacks globes vertically 50/50; P shows tabs A | B | Difference with a single globe.

---

## Cross-screen: Data notes drawer (reachable via ⓘ)

Sections: Snapshot (id, date, source URL), Filters applied (list with counts excluded: no coordinates, geospatial issues, living specimens, fossils, non-open licences, uncertainty over threshold, no year), Licences and attribution, Known biases (observer density, taxonomic bias, coordinate precision, recent-bin lag), Terms for IUCN/curated data, "Report a data problem" mailto link. All numbers come from the manifest (A-01).
