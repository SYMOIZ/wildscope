# WildScope — Product Vision

Status: blueprint v1.0 (design only, nothing implemented) · Date: 2026-10-31

## 1. One-line definition

WildScope is a 3D planetary exploration tool, in the spirit of Google Earth, dedicated only to **trees and animals**: you fly over the Earth, pick a species, and see where it has been *recorded*, how those records change across decades, and what is scientifically known about its biology.

## 2. The problem

- Biodiversity data (GBIF, IUCN, trait databases) is large, global and open, but the public interfaces are tables, filters and flat maps built for researchers.
- Consumer nature apps show *pictures and names*, not the spatial and historical structure of the records.
- Existing viewers (GBIF.org species map, Map of Life, national portals) are accurate but flat, dense, and rarely tell a story across time.

WildScope's bet: a globe where **records are the interface**. Rotating the planet, zooming from orbit to a region, and scrubbing a timeline should feel like one continuous act of discovery, with every number traceable to a source.

## 3. Audience

| Persona | Need | What success looks like |
|---|---|---|
| Curious explorer (student, hobbyist, age 14+) | Wander and be surprised | Finds a species they did not know, understands what the dots mean |
| Educator | Show a class how records and time interact | Shares a URL that reopens the exact view |
| Naturalist / amateur ecologist | Check where a species has been recorded in a region | Reads counts and sources without exporting CSVs |
| Researcher-adjacent (journalist, NGO analyst) | Quick, honest first look | Sees limits of the data stated beside every view |

Out of scope users: people needing species identification from photos, field-data entry, legal/regulatory determinations.

## 4. Product principles

1. **The globe is the product.** Every feature acts on the globe or is reached from it. No feature lives only in a side page.
2. **Records are not reality.** The UI never presents "no records" as "absent" or "extinct". Sampling effort is always available as a counter-layer.
3. **Every number has a source.** Any figure on screen links to a provenance entry (dataset, snapshot date, licence).
4. **Five kinds of knowledge, never blended.** Recorded occurrence · estimated distribution · biological lifespan · life-cycle stage · conservation classification · confirmed extinction. Each has its own label, icon-free typographic treatment and provenance line (see Section 6).
5. **No invented content.** No placeholder statistics, no generated biology. If data is missing, the interface says what is missing.
6. **Calm, scientific, premium.** Dark planetary canvas, restrained chrome, one panel at a time, motion that explains (fly-to, bin transitions) rather than decorates.
7. **AI is a translator, not an author.** The AI interface converts a typed question into a structured query and displays a templated answer built from retrieved numbers. It never writes biology.

## 5. Experience pillars

1. **Orbit** — Landing opens directly on a live globe showing density of recorded life, not a hero image.
2. **Lens** — A single switch, *Trees | Animals*, re-colours and re-filters the planet. Nothing else mixes the two.
3. **Species** — Searching or clicking a hex cell yields a ranked species list; selecting one turns the globe into that species' record map.
4. **Time** — A bottom timeline of nine bins (before 1950 … 2020–snapshot) re-renders the actual aggregates; it is not an animation of interpolated data.
5. **Life** — For species with a reviewed, cited life-cycle record, a stage-by-stage view; other species honestly show "not yet documented".
6. **Compare** — Two species, or one species across two time bins, side by side on two linked globes or one split view.
7. **Ask** — Natural-language questions mapped to the same operations the UI already supports.

## 6. Knowledge categories (canonical vocabulary)

These six terms are used identically in every document and in the UI copy.

| Term | Definition | Primary source in MVP | Shown how |
|---|---|---|---|
| **Recorded occurrence** | One georeferenced observation or specimen record that survived quality filters | GBIF occurrence snapshot on AWS | Hex-cell counts, "records" wording |
| **Estimated geographic distribution** | An expert/modelled range polygon | Not available under an open licence in MVP | Not shown (see UN-01 in TECHNICAL_ROADMAP) |
| **Biological lifespan** | Documented longevity (typical or maximum) with measurement context | Curated, cited entries only | Value + type + citation |
| **Species life-cycle stage** | Ordered developmental stages of the species | Curated, cited entries only | Stage rail with citation |
| **Conservation classification** | Red List category assigned by an assessing body at a date | IUCN Red List (category; assessment year when the source provides it) | Chip with category text, assessor, year when provided |
| **Confirmed extinction** | Category EX (or EW for extinct in the wild) assigned by IUCN | IUCN Red List | Only when IUCN category is EX/EW; wording "Assessed as Extinct by IUCN (year)" |

Absence of records, a declining trend in records, or a drop in recent bins **never** triggers extinction wording. A "Records fell" note may appear, always paired with the effort counter.

## 7. Visual direction (summary; full spec in DESIGN_SYSTEM.md)

- Canvas: near-black green-ink with a lit Earth; labels in warm bone white.
- Data colour: two sequential, luminance-ordered ramps — one per lens — so density reads without a legend lookup.
- Typography: a literary serif for species names and headlines, a neutral sans for UI, a monospace for figures.
- Chrome: top-left wordmark + lens switch, top-centre search, right context panel, bottom timeline. No dashboards, tiles grids or decorative chat bubbles.
- Reference: Google Earth for *spatial interaction grammar* (drag, tilt, fly-to, search-to-place). Not its look, layout or branding.

## 8. Success measures (product level)

Measured after launch with privacy-preserving, aggregate analytics only (no user identifiers):

| Measure | Target (to validate) |
|---|---|
| Visitors who select a species within the first session | ≥ 50% |
| Sessions that use the timeline at least once | ≥ 40% |
| Sessions that open the data-notes panel | ≥ 10% (indicates trust-seeking is easy) |
| Share-URL re-open produces identical view | 100% (automated test) |
| Views with unsourced numbers | 0 (build-time test) |

## 9. Non-goals

- Species identification, observation submission, social features.
- Predicting extinction, climate projections, or habitat suitability modelling.
- Medical, legal, conservation-policy or trade advice.
- Showing precise locations of sensitive species (see REQUIREMENTS FR-22 on coordinate generalisation).
- Replacing GBIF, IUCN or any source; WildScope always links back.

## 10. Release framing

- **Contest cut (P0)** — shipped by the submission deadline; see TECHNICAL_ROADMAP section 2.
- **MVP (P0 + P1)** — complete first release.
- **Future (P2)** — only after data/licensing decisions in TECHNICAL_ROADMAP section 5 are closed.
