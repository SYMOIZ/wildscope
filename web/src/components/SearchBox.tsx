import { useEffect, useRef, useState } from "react";
import * as K from "../config/interaction";
import { loadSearchShard } from "../data/assets";
import { editDistanceAtMost1, fold } from "../data/format";
import type { SearchEntry } from "../data/types";
import { selectPlace, selectSpecies, type Place } from "../state/actions";
import { useStore } from "../state/store";
import { Num } from "./Num";

interface PlaceResult {
  state: "idle" | "loading" | "ok" | "unavailable";
  items: Place[];
  attribution: string | null;
}

/** INTERACTION §7 precedence: exact scientific, exact vernacular, prefix, fuzzy (edit distance <= 1). */
export function rankSpecies(entries: SearchEntry[], query: string): SearchEntry[] {
  const q = fold(query.trim());
  const scored: { e: SearchEntry; s: number }[] = [];
  for (const e of entries) {
    const sci = fold(e[1]);
    const verns = e[2].map(fold);
    let s = -1;
    if (sci === q) s = 0;
    else if (verns.includes(q)) s = 1;
    else if (sci.startsWith(q) || verns.some((v) => v.startsWith(q))) s = 2;
    else if ([sci, ...verns].some((n) => n.split(/[\s-]+/).some((w) => w.startsWith(q)))) s = 3;
    else if (q.length >= 4 && [sci, ...verns].some((n) => editDistanceAtMost1(n, q))) s = 4;
    if (s >= 0) scored.push({ e, s });
  }
  scored.sort((a, b) => a.s - b.s || b.e[5] - a.e[5] || a.e[1].localeCompare(b.e[1]));
  return scored.slice(0, K.MAX_SPECIES_RESULTS).map((x) => x.e);
}

export function SearchBox() {
  const manifest = useStore((s) => s.manifest);
  const config = useStore((s) => s.config);
  const camera = useStore((s) => s.camera);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [species, setSpecies] = useState<SearchEntry[]>([]);
  const [places, setPlaces] = useState<PlaceResult>({ state: "idle", items: [], attribution: null });
  const input = useRef<HTMLInputElement>(null);
  const groupLabel = (id: string) => manifest?.lenses.animals.groups.find((g) => g.id === id)?.label ?? id;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const query = q.trim();
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      // Species: prefix-sharded static index (A-04).
      const prefix = fold(query).slice(0, 2);
      if (manifest && query.length >= K.SPECIES_MIN_CHARS && manifest.species.searchPrefixes.includes(prefix)) {
        try {
          const shard = await loadSearchShard(manifest.datasetId, prefix);
          if (!ctrl.signal.aborted) setSpecies(rankSpecies(shard, query));
        } catch {
          if (!ctrl.signal.aborted) setSpecies([]);
        }
      } else {
        setSpecies([]);
      }
      // Places: E-06 via API Gateway + Lambda + Amazon Location Places.
      if (query.length >= K.PLACE_MIN_CHARS && config) {
        setPlaces((p) => ({ ...p, state: "loading" }));
        try {
          const params = new URLSearchParams({ q: query, limit: String(K.MAX_PLACE_RESULTS) });
          if (camera) {
            params.set("biasLat", camera.lat.toFixed(3));
            params.set("biasLon", camera.lon.toFixed(3));
          }
          const r = await fetch(`${config.apiBase}/geo/search?${params}`, { signal: ctrl.signal });
          if (!r.ok) throw new Error(String(r.status));
          const body = await r.json();
          setPlaces({ state: "ok", items: body.results ?? [], attribution: body.attribution ?? null });
        } catch {
          if (!ctrl.signal.aborted) setPlaces({ state: "unavailable", items: [], attribution: null });
        }
      } else {
        setPlaces({ state: "idle", items: [], attribution: null });
      }
      setActive(0);
    }, K.SEARCH_DEBOUNCE_MS);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
    // Camera bias is read at query time only; re-querying on every camera move would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, manifest, config]);

  const options: ({ kind: "place"; p: Place } | { kind: "species"; e: SearchEntry })[] = [
    ...places.items.map((p) => ({ kind: "place" as const, p })),
    ...species.map((e) => ({ kind: "species" as const, e })),
  ];

  const choose = (i: number) => {
    const o = options[i];
    if (!o) return;
    setOpen(false);
    input.current?.blur();
    if (o.kind === "place") selectPlace(o.p);
    else void selectSpecies(o.e[0]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); choose(active); }
    else if (e.key === "Escape") { setOpen(false); input.current?.blur(); }
  };

  const showList = open && q.trim().length >= K.SPECIES_MIN_CHARS;
  const loading = places.state === "loading";
  return (
    <div className="search">
      <input
        ref={input}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder="Search places or species"
        aria-label="Search places or species"
        role="combobox"
        aria-expanded={showList}
        aria-controls="search-results"
        aria-activedescendant={showList && options[active] ? `opt-${active}` : undefined}
        aria-busy={loading}
      />
      <kbd aria-hidden="true">/</kbd>
      {showList && (
        <div id="search-results" className="results glass" role="listbox">
          {places.items.length > 0 && <h3>Places</h3>}
          {places.items.map((p, i) => (
            <div key={p.id} id={`opt-${i}`} role="option" aria-selected={active === i} onMouseDown={() => choose(i)}>
              <div>{p.label}</div>
              <div className="sub">{p.type}{p.countryCode ? ` · ${p.countryCode}` : ""}</div>
            </div>
          ))}
          {places.items.length > 0 && places.attribution && <div className="note caption">{places.attribution}</div>}
          {species.length > 0 && <h3>Species</h3>}
          {species.map((e, j) => {
            const i = places.items.length + j;
            return (
              <div key={e[0]} id={`opt-${i}`} role="option" aria-selected={active === i} onMouseDown={() => choose(i)}>
                <div><span className="name sci">{e[1]}</span>{e[2][0] && <span className="muted small"> · {e[2][0]}</span>}</div>
                <div className="sub">{groupLabel(e[4])} · <Num value={e[5]} source="A-04" /> records</div>
              </div>
            );
          })}
          {loading && <div className="note">Searching places…</div>}
          {places.state === "unavailable" && <div className="note">Place search unavailable. Species results are still shown.</div>}
          {!loading && options.length === 0 && (
            <div className="note">No places or species match. Try a country, city, or scientific name.</div>
          )}
        </div>
      )}
    </div>
  );
}
