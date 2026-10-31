# WildScope — Interaction Specifications

Notation: "D" mouse + keyboard, "T/P" touch. Thresholds are tunable constants kept in one config module (`config/interaction.ts`) so values can be changed without code edits. Times in ms.

## 1. Global state model

Single store (URL-serialisable subset marked *).

| Key | Values | Default |
|---|---|---|
| `lens`* | `trees` \| `animals` | `animals` |
| `group`* | group id or `all` | `all` |
| `species`* | speciesKey or null | null |
| `bin`* | `B00`…`B08` \| `all` | `all` |
| `mode`* | `density` \| `effort` | `density` |
| `normalised`* | boolean | false |
| `cam`* | `lat,lon,height` | arrival camera |
| `panel`* | `none` \| `region` \| `species` \| `life` \| `ask` \| `compare` | `none` |
| `selectedCell` | H3 id + res | null |
| `compare`* | `{type, a, b}` | null |
| `lod` | derived L0/L1/L2 | — |

URL format: `/?lens=animals&group=birds&sp=<speciesKey>&bin=B05&mode=density&n=0&cam=-1.3,32.9,2100000&panel=species`.
Rules: unknown/invalid values fall back to defaults and show no error; `cam` height is clamped to 200 km–25,000 km.

## 2. Camera

| Action | Mouse/keyboard (D) | Touch (T/P) | Result |
|---|---|---|---|
| Rotate | Left-drag; `←↑↓→` (5°/press; hold repeats) | One-finger drag | Orbit around globe centre; inertia 600 ms |
| Zoom | Wheel (exponential by 12% per notch); `+` / `-` | Pinch | Camera height clamped 200 km–25,000 km |
| Tilt | Right-drag or `Shift`+drag; `PgUp/PgDn` | Two-finger vertical drag | Tilt 0–60°; resets on Reset-north |
| Reset north | `N` or button | Button | 480 ms animation |
| Fly-to point | Double-click | Double-tap | Camera moves to 1,500 km height centred on point; `dur-fly` |
| Fly-to bounds | Programmatic (search, species select) | same | Fit bounds with 12% padding |
| Auto-rotate | Only on S01/S02 first 20 s idle | same | 1.2°/s; cancels on any input; disabled with reduced motion |

LOD switching: evaluated on camera-change end (debounced 150 ms) and at 10 Hz during continuous zoom. Hysteresis: switch up when height < threshold × 0.9, switch down when > threshold × 1.1. Layers cross-fade in `dur-slow`.

## 3. Hover, selection, panels

- **Hover (D)**: cell under pointer is picked using `scene.pick` limited to the density primitive; tooltip appears after 150 ms, positioned 12 px from the pointer; disappears on pointer leave or drag start. Tooltip text: `<n> recorded occurrences · <bin label> · effort <m>`.
- **Click/tap**: selects a cell; opens Region summary. Clicking the same cell again deselects and closes the panel. Click on empty space deselects.
- **Keyboard selection**: `Tab` into the canvas enters "cell cursor" mode: arrow keys move the cursor to the neighbouring populated cell in that direction; `Enter` selects; `Esc` exits. The live region announces cell content.
- **Panels**: one at a time; opening replaces and pushes to the back stack (max 5). `Esc` closes the topmost panel; focus returns to the element that opened it.
- **Species row click** inside Region summary: opens S05, enters species mode (§6), pushes history.
- **Leave species mode**: ✕ in top bar or `Backspace` when focus is on canvas; returns to density mode with previous camera.

## 4. Lens and group

- Switching **lens**: keep camera, bin, normalised, mode; reset `group` to `all`; if `species` is set and belongs to the other lens, clear it and show a toast "Species cleared: it belongs to the other lens." Layer swap: old layer fades out 240 ms while new fades in 240 ms; if new data is not cached, old layer remains at 40% until loaded.
- Switching **group**: keep camera and bin; if species is set and not in the group, clear species with the same toast pattern.
- Keyboard: `T` Trees, `A` Animals, `G` focuses group rail, number keys `1–8` select groups in order.

## 5. Timeline

| Action | Behaviour |
|---|---|
| Click a tick | Select that bin; layer cross-fades (`dur-slow`) |
| Drag handle | Snaps to nearest tick on release; during drag, preview label only (no layer change) to avoid loading storms |
| `←/→` on focused scrubber | Previous/next bin; `Home`/`End` first/last; `Space` toggles Play |
| Play | Steps B00→B08; 1,500 ms dwell; stops at B08 and returns focus to Play; `Esc` pauses |
| All years | Aggregated layer (sum of bins); hides effort strip bar highlight |
| Effort-normalised toggle | Toggles `normalised`; if effort not available for the bin, toggle is disabled with tooltip |
| Expand | `E` or button; animates height 240 ms |

Preload rule: when a bin is selected, bins ±1 are fetched in the background at low priority; during Play, the next two bins are prefetched.

## 6. Species mode

Entering:
1. Fetch species file (A-03) and species timeline (E-03).
2. Compute record-extent target: central 98% of record positions by weighted quantiles of lat/lon from the L1 cells; fit bounds.
3. Replace density layer with species layer; legend rescales to species' own range with caption "Scale is relative to this species' records."
Edge cases: antimeridian — use cell-centre longitudes unwrapped to minimise span; fewer than 5 cells — fly to cell centroid at 2,500 km; sensitive species (FR-22) — cap zoom at L1 (camera height min 2,000 km) and show note.

## 7. Search

- Open: `/` or click; focus input; Esc closes.
- Typeahead: species from the prefix-sharded index (A-04) after the first two characters; places after 3 characters via E-06; debounce 120 ms; cancel in-flight requests when query changes.
- Keys: `↓/↑` move, `Enter` choose, `Tab` cycles sections, `Alt+↓` opens Recent.
- Result precedence: exact scientific-name match first, then exact vernacular, then prefix, then fuzzy (edit distance ≤ 1); max 8 species + 5 places.

## 8. Compare

- Entering from S05: sets A = current species/bin; opens selectors for B.
- Linked cameras: any camera change on one globe is mirrored on the other with 0 ms delay; a lock icon toggles linking.
- Switching variant keeps A and clears B if types are incompatible.
- Difference tab availability: `normalised = true` required; otherwise tab disabled with the reason inline.
- Exit: Back/`Esc` returns to previous panel and restores single-globe layout; camera becomes the A globe's camera.

## 9. Ask

- Submit with `Enter`; `Shift+Enter` new line (max 300 characters; counter at 250).
- Request lifecycle: POST E-08; 6,000 ms timeout; one automatic retry on 5xx; no retry on 4xx.
- Result application: only after the user sees the answer; the globe change animates; an "Undo" link restores the previous state for 20 s.
- Disambiguation: the API may return `needs_clarification` with candidates; the UI shows a radio list; the user choice resubmits with `resolved` params.
- Rate limit message: "Too many questions. Try again in <n> s."

## 10. Share

- Share button copies the canonical URL; shows a toast "Link copied". If clipboard API fails, a read-only input with the URL is shown, pre-selected.
- URL includes `snap=<snapshot id>`; when opened and the snapshot is no longer available, the app loads the current one and shows a banner "This link was made with data from <old>. Showing <new>."

## 11. Error and retry grammar

| Failure | UX |
|---|---|
| Static data 404/5xx | Banner "Could not load <what>. Retry". Last good layer stays. Exponential retry 2 s, 4 s, 8 s (max 3) then manual |
| API 429 | Inline "Busy. Try again in <n> s." using `Retry-After` |
| API timeout | Same as 5xx for non-critical blocks; the globe never blocks on the API |
| WebGL context lost | Overlay "Graphics context lost. Reloading view…" and auto-restore; if fails twice, show reload button |
| Offline | Banner "You are offline. Showing data already loaded." |

## 12. Performance behaviours

- Density primitives built per LOD in Web Worker, transferred as typed arrays; main thread only adds the primitive. (PoC required: UD-03.)
- Shard cache: in-memory LRU 150 MB cap; plus Cache API storage with 7-day expiry keyed by snapshot id.
- Cancel loads of shards that leave the frustum for > 2 s.
- Frame budget: main-thread tasks > 16 ms are flagged in dev builds.

## 13. Keyboard map (summary)

| Key | Action |
|---|---|
| `/` | Focus search |
| `T`, `A` | Trees, Animals lens |
| `G`, `1–8` | Group rail focus, select group |
| `N` | Reset north |
| `+`, `-` | Zoom |
| Arrow keys | Rotate (canvas focus) / move cell cursor (cell-cursor mode) |
| `Enter` | Select cell/result |
| `Esc` | Close panel / exit mode |
| `Space` | Play/Pause (timeline focus) |
| `E` | Expand timeline |
| `I` | Open Data notes |
| `?` | Show shortcut sheet |
