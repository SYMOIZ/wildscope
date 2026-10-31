# WildScope — Design System

Principle: the globe is the canvas, interface chrome is thin, one floating panel at a time. No card grids, no dashboard tiles, no gradients except the two data ramps and the atmosphere glow of the globe.

## 1. Tokens

### 1.1 Colour — interface

| Token | Hex | Use |
|---|---|---|
| `ink-900` | `#06100D` | App background behind globe (space) |
| `ink-800` | `#0C1A16` | Panel base (used at 88% opacity over the globe) |
| `ink-700` | `#13261F` | Raised rows, hover fills |
| `line` | `#EDE8DC` at 14% | 1 px hairlines |
| `bone-100` | `#EDE8DC` | Primary text |
| `bone-300` | `#B4BBAE` | Secondary text |
| `bone-500` | `#7C887F` | Tertiary text, disabled (not for essential info) |
| `focus` | `#F4D58D` | Focus ring (2 px, offset 2 px), selection outline |
| `signal` | `#7FD1C7` | Interactive accent (links, active toggles) |
| `warn` | `#E8A25C` | Data-limit notices (text always accompanies colour) |
| `error` | `#E07A6B` | Error text/icons (text always accompanies colour) |

Contrast requirement: all text tokens ≥ 4.5:1 on `ink-800`; `bone-500` is permitted only for non-essential text ≥ 3:1 and never carries data.

### 1.2 Colour — data ramps (7 stops, increasing lightness)

Both ramps are single-journey sequential ramps so order reads from lightness alone (colour-vision-deficiency safe by construction; to be verified in AC-051).

| Stop | Trees | Animals |
|---|---|---|
| 1 (lowest) | `#16352A` | `#2A2144` |
| 2 | `#1F5B3D` | `#4A2B6B` |
| 3 | `#3A8450` | `#7A3A86` |
| 4 | `#69A85A` | `#B04D83` |
| 5 | `#9CC96B` | `#DE7A7E` |
| 6 | `#C9E58B` | `#F5AC85` |
| 7 (highest) | `#EFF8B8` | `#FFE0A8` |

Rules: cells use fill alpha 0.78 over the globe (so land/ocean reads through); selected cell gets a `focus` outline 2 px. Difference layers (compare) use a separate diverging pair, `#4B9CD3` (share fell) ↔ `#E3A857` (share rose), centred on a neutral `#2B2F2D`, always labelled "share of records", never "population".

Hatched pattern for "insufficient effort" cells: 45° lines, `bone-500` at 40%, 2 px spacing 6 px.

### 1.3 Typography

| Role | Family (all SIL OFL) | Weights | Notes |
|---|---|---|---|
| Display / species names | Fraunces | 400, 600 (italic for scientific names) | Binomials always italic |
| UI | Inter | 400, 500, 600 | Tabular numerals off in prose |
| Figures / provenance | JetBrains Mono | 400, 500 | Counts, years, snapshot ids; tabular numerals |

Scale (rem at 16 px root): 0.75 caption · 0.875 UI small · 1 body · 1.125 UI large · 1.5 panel title · 2.25 species name · 3.5 landing title. Line height: 1.5 body, 1.15 display.

Fonts are self-hosted from the CloudFront origin (no third-party font requests).

### 1.4 Spacing, radii, elevation

- Base unit 4 px; scale 4, 8, 12, 16, 24, 32, 48.
- Radii: 2 px (inputs, chips), 8 px (panels). No fully rounded pills except the lens switch.
- Elevation: panels use a 1 px `line` border and `backdrop-filter: blur(14px)`; no drop shadows heavier than `0 8px 24px rgba(0,0,0,.35)`.

### 1.5 Motion

| Token | Value | Use |
|---|---|---|
| `dur-fast` | 120 ms | Hover, toggles |
| `dur-mid` | 240 ms | Panel open/close |
| `dur-slow` | 480 ms | Layer cross-fade between bins |
| `dur-fly` | 1800 ms | Camera fly-to (distance-scaled, clamp 600–2600 ms) |
| `ease` | `cubic-bezier(.2,.8,.2,1)` | Default |

`prefers-reduced-motion`: auto-rotation off, fly-to becomes instant jump with a 120 ms fade, bin transitions are instantaneous, Play steps without cross-fade.

## 2. Globe visual language

- Imagery: basemap supplied by Amazon Location Service where feasible (decision UD-02, TECHNICAL_ROADMAP); otherwise a neutral dark Earth imagery set. Imagery is dimmed (brightness 0.55, saturation 0.7) so the data ramp dominates.
- Atmosphere: single thin rim glow (`signal` at 12%), no stars texture beyond a static dim star field.
- Labels: country labels appear only at L1/L2; no city labels except search result pin.
- Cells never show borders at L0/L1; at L2 a 0.5 px `line` border appears.

## 3. Components

All components specify states: default · hover · focus · active · disabled · loading · error.

| Component | Anatomy | Notes |
|---|---|---|
| **Lens switch** | Two-segment pill: Trees / Animals; active segment filled with lens ramp stop 5 and `ink-900` text | Keyboard: `←/→`, `T`, `A` |
| **Group rail** | Vertical list of text buttons at left centre (7 for Animals, 4 for Trees) + "All" | Text-only, no icons; active has 2 px left bar in ramp stop 5 |
| **Search** | Single input, `/` shortcut, results in a listbox below; result row: name (display font), subtitle (group, record count) | Typeahead debounce 120 ms |
| **Context panel** | Right side, 380 px (desktop), bottom sheet on tablet/phone; header, body, footer with provenance link | Only one at a time |
| **Timeline** | Bottom bar: 9 bin ticks, handle, Play/Pause, effort strip above ticks | Ticks labelled "<1950", "1950s" … "2010s", "2020–" |
| **Legend** | Bottom-left, 7-step ramp with log breaks, caption sentence, collapse button | Breaks computed from the active layer quantiles |
| **Provenance line** | Mono caption: `GBIF snapshot 2026-10-01 · CC0/CC BY · n=…` plus "Data notes" link | Appears in every panel footer |
| **Classification chip** | Text label "IUCN: Vulnerable (VU)" plus ", assessed <year>" only when the source provides a year; hairline border, no alarm colour fill | Text always present |
| **Stage rail** | Horizontal ordered list of stages, selected stage expands below | Stage numbers present |
| **Data notes drawer** | Left drawer 420 px | Snapshot, filters, excluded counts, biases, licences, citations |
| **Toast / banner** | Top-centre, single line + action | Errors, partial data |
| **Hatch swatch** | Legend item for insufficient effort | |

## 4. Layout grid

Desktop (≥ 1024 px): the canvas fills the viewport. Fixed zones:

```
┌───────────────────────────────────────────────────────────────┐
│ wordmark  [Trees|Animals]      [ search  / ]          Ask  ⓘ  │  top bar 56 px
│ group rail                                         ┌────────┐ │
│ (left, vertically centred)                         │ context│ │
│                                                    │ panel  │ │
│ legend (bottom-left)                               │ 380 px │ │
│                                  camera controls   └────────┘ │
│ ─ timeline (bottom, 88 px incl. effort strip) ─────────────── │
└───────────────────────────────────────────────────────────────┘
```

Tablet (640–1023 px): group rail collapses into a "Group" menu in the top bar; context panel becomes a bottom sheet (snap 40% / 90%); timeline docked above the sheet when the sheet is closed.

Phone (< 640 px): top bar holds lens switch and search icon; group menu in the lens switch overflow; bottom has timeline (56 px, bins as 9 dots); sheet snaps 40% / 90%; legend collapses to a single-line caption.

## 5. Content style

- Voice: precise, quiet, plain. Sentences state what the data is.
- Always "recorded" / "records", never "found", "lives", "disappeared".
- Scientific names italic; common names in roman; both when available.
- Numbers: thousands separators; counts under 1,000 shown exactly; ≥ 1,000,000 abbreviated "1.2 M" with exact value in tooltip.
- No exclamation marks, no emojis, no marketing superlatives.
- Empty state formula: *What is empty* + *why that may be* + *what to do*. Example: "No records in 1960–69. Fewer observers contributed data in these years. Try another bin or view effort."

## 6. Iconography

Minimal set, outline, 1.5 px stroke, 20 px grid: search, close, play, pause, reset north, zoom in/out, compare, info, share, external link, chevrons. Taxonomic groups use text, not pictograms (avoids misleading silhouettes).

## 7. Accessibility rules (design level)

- Focus ring `focus` on all interactive elements, never removed.
- Hit areas ≥ 44 × 44 px on touch.
- Colour never alone: ramps are paired with the legend text; classification chips contain words; hatching distinguishes insufficient effort.
- Tooltips are not the only way to read data; the Table view (FR-29) offers the same figures.
- Canvas has an `aria-label` describing the active view; live region announces camera-target changes ("Showing Animals, Birds, 1990s, Africa").
- Reduced motion and high-contrast handled as in §1.5.
