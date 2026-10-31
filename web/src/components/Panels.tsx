import { cellToParent } from "h3-js";
import { useEffect, useState } from "react";
import { loadRegion, loadSearchShard } from "../data/assets";
import { fold, fmtExact } from "../data/format";
import {
  fetchIucn, fetchSpeciesPhotos, fetchViewFacets, matchSpecies, taxonName,
  type Conservation, type Facet, type Photo, type ViewFacets,
} from "../data/gbif";
import type { CellSummary, Manifest, RegionFile } from "../data/types";
import { GROUP_COLORS } from "../globe/Globe";
import type { Layer } from "../globe/layerModel";
import { flyToSpecies, selectSpecies } from "../state/actions";
import { useStore } from "../state/store";
import { Bars, ShareBars } from "./Bars";
import { ConservationChip, iucnLabel } from "./Conservation";
import { Icon } from "./Icon";
import { Num } from "./Num";
import { shareView } from "./share";

const LANG: Record<string, string> = { eng: "en", fra: "fr", spa: "es", deu: "de", por: "pt", nld: "nl", ita: "it", swe: "sv", dan: "da", nor: "no", fin: "fi", jpn: "ja", zho: "zh", rus: "ru" };
const BASIS: Record<string, string> = {
  HUMAN_OBSERVATION: "Human observation",
  OBSERVATION: "Observation",
  PRESERVED_SPECIMEN: "Preserved specimen",
  MACHINE_OBSERVATION: "Machine observation (e.g. camera trap, acoustic)",
};

function countryName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function groupLabel(m: Manifest, id: string) {
  return m.lenses.animals.groups.find((g) => g.id === id)?.label ?? id;
}

export function Provenance({ live = false }: { live?: boolean }) {
  const m = useStore((s) => s.manifest);
  const set = useStore((s) => s.set);
  if (!m) return null;
  return (
    <div className="provenance caption">
      {live ? <>Live records: GBIF.org occurrence API · CC0/CC BY · </> : null}
      GBIF snapshot {m.snapshot.id} · CC0/CC BY · n=<Num value={m.filters.keptAfterDuplicates ?? m.filters.kept} source="A-01" />
      {m.build.kind !== "full" && <> · {m.build.kind} build</>} · <button onClick={() => set({ notesOpen: true })}>Data notes</button>
    </div>
  );
}

function PanelFrame({ title, children, onClose, tall, live }: { title: React.ReactNode; children: React.ReactNode; onClose: () => void; tall?: boolean; live?: boolean }) {
  return (
    <aside className={`panel glass${tall ? " tall" : ""}`} aria-label="Context panel">
      <header>
        <div className="title">{title}</div>
        <button className="icon-btn" aria-label="Close panel" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <div className="body">{children}</div>
      <footer><Provenance live={live} /></footer>
    </aside>
  );
}

/** Live block state: loading → value | null (none) | "error". */
type Async<T> = { state: "loading" } | { state: "ok"; value: T } | { state: "error" };

function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): Async<T> {
  const [v, setV] = useState<Async<T>>({ state: "loading" });
  useEffect(() => {
    let alive = true;
    setV({ state: "loading" });
    fn().then((value) => alive && setV({ state: "ok", value }), () => alive && setV({ state: "error" }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return v;
}

function PhotoStrip({ photos: all }: { photos: (Photo & { recordKey?: number; date?: string | null; country?: string | null })[] }) {
  const [i, setI] = useState(0);
  // GBIF's image cache creates each size on first request and that first request can fail: retry each
  // image once after a short delay (a #fragment forces a reload), then drop it instead of showing a broken icon.
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [retried, setRetried] = useState<Set<string>>(new Set());
  const markBroken = (url: string) => {
    if (!retried.has(url)) {
      window.setTimeout(() => setRetried((r) => new Set(r).add(url)), 1500);
      return;
    }
    setBroken((b) => new Set(b).add(url));
  };
  const src = (url: string) => (retried.has(url) ? `${url}#retry` : url);
  const photos = all.filter((x) => !broken.has(x.thumb) && !broken.has(x.large));
  const p = photos[Math.min(i, photos.length - 1)];
  if (!p) return null;
  return (
    <figure className="photo">
      <img src={src(p.large)} onError={() => markBroken(p.large)} alt={`Photograph from a GBIF record${p.date ? `, ${p.date.slice(0, 10)}` : ""}`} loading="lazy" />
      <figcaption className="caption">
        {p.creator ? <>© {p.creator} · </> : null}{p.licence}
        {p.recordKey ? <> · <a href={`https://www.gbif.org/occurrence/${p.recordKey}`} target="_blank" rel="noreferrer">GBIF record</a></> : null}
        {p.date ? <> · {p.date.slice(0, 10)}</> : null}
      </figcaption>
      {photos.length > 1 && (
        <div className="thumbs" role="listbox" aria-label="Photographs">
          {photos.map((t, j) => (
            <button key={t.thumb} role="option" aria-selected={j === i} onClick={() => setI(j)}>
              <img src={src(t.thumb)} alt="" loading="lazy" onError={() => markBroken(t.thumb)} />
            </button>
          ))}
        </div>
      )}
    </figure>
  );
}

/** S05 Species detail. Snapshot figures (A-03) and live GBIF blocks (photos, IUCN) are kept apart. */
export function SpeciesPanel() {
  const sp = useStore((s) => s.species);
  const m = useStore((s) => s.manifest);
  const bin = useStore((s) => s.bin);
  const set = useStore((s) => s.set);
  const usage = useAsync(() => (sp ? matchSpecies(sp.canonicalName, sp.taxonomy.class) : Promise.resolve(null)), [sp?.speciesKey]);
  const usageKey = usage.state === "ok" ? usage.value : null;
  const iucn = useAsync<Conservation | null>(() => (usageKey ? fetchIucn(usageKey) : Promise.resolve(null)), [usageKey]);
  const photos = useAsync(() => (usageKey ? fetchSpeciesPhotos(usageKey) : Promise.resolve({ photos: [] })), [usageKey]);
  if (!sp || !m) return null;
  const r = sp.records;
  const lic = r.licence;
  const licTotal = (lic.CC0_1_0 ?? 0) + (lic.CC_BY_4_0 ?? 0);
  const pct = (n: number) => (licTotal ? Math.round((n / licTotal) * 100) : 0);
  const shown = sp.vernacularNames.slice(0, 3);
  const more = sp.vernacularNamesTotal - shown.length;
  const authorship = sp.scientificName !== sp.canonicalName ? sp.scientificName.slice(sp.canonicalName.length).trim() : "";
  const bi = bin === "all" ? undefined : m.bins.findIndex((b) => b.id === bin);
  const resolving = usage.state === "loading" || (usageKey !== null && (photos.state === "loading" || iucn.state === "loading"));

  return (
    <PanelFrame
      tall
      onClose={() => set({ panel: "none" })}
      title={
        <>
          <div className="eyebrow">{groupLabel(m, sp.group)}{sp.taxonomy.family ? ` · ${sp.taxonomy.family}` : ""}</div>
          <h2>{sp.canonicalName}</h2>
          {shown.length > 0 && (
            <div className="vernacular">
              {shown.map((v, i) => (
                <span key={i}>{i > 0 && " · "}{v.name}{v.lang && <span className="muted caption"> {LANG[v.lang] ?? v.lang}</span>}</span>
              ))}
              {more > 0 && <span className="muted"> · +{more} more</span>}
            </div>
          )}
          <div className="small muted">
            {authorship && <span>{authorship} · </span>}
            {sp.rank ? sp.rank.toLowerCase() : "species"}
            {sp.taxonomicStatus && <> · {sp.taxonomicStatus.toLowerCase().replace(/_/g, " ")} name (Catalogue of Life)</>}
          </div>
        </>
      }
    >
      {photos.state === "ok" && photos.value.photos.length > 0 ? (
        <PhotoStrip photos={photos.value.photos} />
      ) : (
        <div className="placeholder" aria-hidden={resolving ? undefined : "true"}>
          {resolving ? <span className="caption">Looking for licensed photographs…</span> : (sp.taxonomy.genus ?? sp.canonicalName)[0]}
        </div>
      )}
      {photos.state === "ok" && photos.value.photos.length === 0 && !resolving && (
        <p className="caption muted">No CC0 or CC BY photograph found in GBIF records for this species.</p>
      )}

      <div className="chips">
        {iucn.state === "ok" && iucn.value ? (
          <ConservationChip code={iucn.value.code} source="IUCN Red List category via GBIF species API" />
        ) : iucn.state !== "loading" && usage.state !== "loading" ? (
          <span className="chip muted">Not in the IUCN data used</span>
        ) : null}
        {sp.sensitive && <span className="chip warn">Location generalised</span>}
      </div>

      <h3>Records in the snapshot</h3>
      <dl>
        <dt>Recorded occurrences</dt><dd><Num value={r.total} source="A-03" exact /></dd>
        <dt>Earliest record in snapshot</dt><dd className="mono" data-source="A-03">{r.earliestYear}</dd>
        <dt>Latest record in snapshot</dt><dd className="mono" data-source="A-03">{r.latestYear}</dd>
        <dt>H3 cells with records (res 4)</dt><dd><Num value={sp.cells.cells.length} source="A-03" exact /></dd>
        <dt>Licence mix</dt>
        <dd className="mono" data-source="A-03">CC0 {pct(lic.CC0_1_0 ?? 0)}% · CC BY {pct(lic.CC_BY_4_0 ?? 0)}%</dd>
      </dl>
      <h3>Records by period</h3>
      <Bars values={r.byBin} labels={m.bins.map((b) => b.tick)} source="A-03" highlight={bi} partial={8} />
      <p className="caption muted">Record counts follow observer effort; compare with the effort strip in the timeline. Fewer records do not mean fewer animals.</p>

      {r.topCountries.length > 0 && (
        <>
          <h3>Countries with most records</h3>
          <dl>
            {r.topCountries.map(([cc, n]) => (
              <div key={cc} style={{ display: "contents" }}>
                <dt>{countryName(cc)}</dt><dd><Num value={n} source="A-03" exact /></dd>
              </div>
            ))}
          </dl>
        </>
      )}

      <div className="actions">
        <button className="btn primary" onClick={() => flyToSpecies(sp)}>Show records on globe</button>
        <button className="btn" onClick={shareView}><Icon name="share" /> Share</button>
      </div>
      <p className="caption muted">Life cycle and ecology notes: none reviewed for this species yet, so none are shown.</p>

      <h3>Taxonomy</h3>
      <ul className="taxonomy">
        {(["kingdom", "phylum", "class", "order", "family", "genus"] as const).map((rank) =>
          sp.taxonomy[rank] ? (
            <li key={rank}><span className="muted">{rank}</span><span>{sp.taxonomy[rank]}</span></li>
          ) : null,
        )}
        <li><span className="muted">species</span><span className="sci">{sp.canonicalName}</span></li>
      </ul>
      <p className="small links">
        <a href={sp.taxonUrl} target="_blank" rel="noreferrer">Catalogue of Life <Icon name="external" /></a>
        {usageKey && <a href={`https://www.gbif.org/species/${usageKey}`} target="_blank" rel="noreferrer">GBIF species page <Icon name="external" /></a>}
      </p>
    </PanelFrame>
  );
}

/** Cell panel: snapshot summary for the clicked H3 cell (A-05), plus the active layer's value (A-02/A-03). */
export function CellPanel({ layer }: { layer: Layer | null }) {
  const sel = useStore((s) => s.selectedCell);
  const m = useStore((s) => s.manifest);
  const bin = useStore((s) => s.bin);
  const pin = useStore((s) => s.pin);
  const species = useStore((s) => s.species);
  const lens = useStore((s) => s.lens);
  const set = useStore((s) => s.set);
  const res2 = sel ? (sel.res === 2 ? sel.id : cellToParent(sel.id, 2)) : null;
  const region = useAsync<RegionFile | null>(
    () => (m && res2 && m.lenses[lens].built ? loadRegion(m.datasetId, lens, res2) : Promise.resolve(null)),
    [m?.datasetId, lens, res2],
  );
  if (!sel || !m) return null;
  const c = layer?.info.get(sel.id);
  const bi = bin === "all" ? -1 : m.bins.findIndex((b) => b.id === bin);
  const binLabel = bin === "all" ? "all years" : m.bins[bi].label;
  const reg = region.state === "ok" ? region.value : null;
  const summ: CellSummary | undefined = reg ? (sel.res === 2 ? reg.cell : reg.children[sel.id]) : undefined;
  const records = summ ? (bi < 0 ? summ.records : summ.byBin[bi]) : 0;
  const speciesN = summ ? (bi < 0 ? summ.species : summ.speciesByBin[bi]) : 0;
  const top = summ ? (summ.top[bi < 0 ? "all" : m.bins[bi].id] ?? []) : [];

  return (
    <PanelFrame
      tall
      onClose={() => set({ panel: species ? "species" : "none", selectedCell: null })}
      title={
        <>
          <div className="eyebrow">H3 cell · resolution {sel.res} · {binLabel}</div>
          <h2 className="plain">{pin ? pin.label : sel.id}</h2>
        </>
      }
    >
      {species && c && (
        <div className="callout">
          <span className="sci">{species.canonicalName}</span>: <Num value={c.records} source="A-03" exact /> records here in {binLabel}
          {c.effort !== null && <> · effort <Num value={c.effort} source="A-02" exact /></>}
        </div>
      )}
      {region.state === "loading" && <p className="small muted">Loading the cell summary…</p>}
      {region.state === "error" && <p className="small">Could not load the cell summary.</p>}
      {region.state === "ok" && !summ && (
        <p className="small">No records in this cell in the snapshot. A cell without records says nothing about whether animals are present.</p>
      )}
      {summ && (
        <>
          <div className="stats">
            <div><span className="stat"><Num value={records} source="A-05" /></span><span className="label">recorded occurrences</span></div>
            <div><span className="stat"><Num value={speciesN} source="A-05" /></span><span className="label">species with records</span></div>
            <div><span className="stat"><Num value={summ.datasets} source="A-05" /></span><span className="label">contributing datasets</span></div>
          </div>
          {records === 0 && <p className="small">No records in {binLabel} for this cell. Try another period or All years.</p>}

          <h3>Records by period (all animals in this cell)</h3>
          <Bars values={summ.byBin} labels={m.bins.map((b) => b.tick)} source="A-05" highlight={bi < 0 ? undefined : bi} partial={8} />

          <h3>Records by group (all years)</h3>
          <ShareBars
            source="A-05"
            colors={GROUP_COLORS}
            items={Object.entries(summ.groups).map(([g, n]) => ({ key: g, label: groupLabel(m, g), value: n }))}
          />

          {top.length > 0 && (
            <>
              <h3>Most recorded species · {binLabel}</h3>
              <ol className="ranked">
                {top.map(([key, n]) => {
                  const [name, vern, grp, hasFile] = reg!.names[key] ?? [key, null, "", false];
                  return (
                    <li key={key}>
                      <button disabled={!hasFile} title={hasFile ? "Open species" : `Fewer than ${m.constants.MIN_SPECIES_RECORDS} records in the snapshot: no species file`} onClick={() => void selectSpecies(key)}>
                        <span className="dot" style={{ background: GROUP_COLORS[grp] }} />
                        <span className="nm"><span className="sci">{name}</span>{vern && <span className="muted small"> · {vern}</span>}</span>
                        <Num value={n} source="A-05" exact />
                      </button>
                    </li>
                  );
                })}
              </ol>
            </>
          )}

          <h3>Data coverage</h3>
          <dl>
            <dt>Records without stated coordinate uncertainty</dt>
            <dd className="mono" data-source="A-05">{fmtExact(summ.noUncertainty)} ({Math.round((summ.noUncertainty / summ.records) * 100)}%)</dd>
            <dt>Contributing datasets</dt><dd><Num value={summ.datasets} source="A-05" exact /></dd>
          </dl>
          <p className="caption muted">
            Counts are recorded occurrences after the build's filters and duplicate rule, not numbers of animals.
            {m.build.kind !== "full" && " This is a sample build, so counts cover only part of the snapshot."}
          </p>
        </>
      )}
    </PanelFrame>
  );
}

/** Close-up level: one GBIF record. */
export function RecordPanel() {
  const rec = useStore((s) => s.record);
  const m = useStore((s) => s.manifest);
  const set = useStore((s) => s.set);
  const names = useAsync(() => (rec?.speciesKey ? taxonName(rec.speciesKey) : Promise.resolve(null)), [rec?.speciesKey]);
  // Is this species one of ours (snapshot species file)? Match by canonical name in the search index.
  const ours = useAsync(async () => {
    if (!rec?.species || !m) return null;
    const prefix = fold(rec.species).slice(0, 2);
    if (!m.species.searchPrefixes.includes(prefix)) return null;
    const shard = await loadSearchShard(m.datasetId, prefix);
    return shard.find((e) => fold(e[1]) === fold(rec.species!))?.[0] ?? null;
  }, [rec?.species, m?.datasetId]);
  if (!rec || !m) return null;
  const vern = names.state === "ok" ? names.value?.vernacular : null;
  return (
    <PanelFrame
      tall
      live
      onClose={() => set({ panel: "none", record: null })}
      title={
        <>
          <div className="eyebrow">GBIF record · {BASIS[rec.basis] ?? rec.basis}</div>
          <h2>{rec.species ?? rec.scientificName}</h2>
          {vern && <div className="vernacular">{vern}</div>}
        </>
      }
    >
      {rec.photos.length > 0 ? <PhotoStrip photos={rec.photos} /> : <p className="caption muted">No photograph with a CC0 or CC BY licence on this record.</p>}
      <div className="chips">
        {rec.iucn && <ConservationChip code={rec.iucn} source="IUCN category carried on the GBIF record" />}
        {rec.establishmentMeans && <span className="chip">Recorded as: {rec.establishmentMeans.toLowerCase().replace(/_/g, " ")}</span>}
      </div>
      <dl>
        <dt>Date</dt><dd className="mono" data-source="LIVE">{rec.eventDate ? rec.eventDate.slice(0, 10) : rec.year ?? "not given"}</dd>
        <dt>Location</dt>
        <dd className="mono" data-source="LIVE">{rec.lat.toFixed(5)}, {rec.lon.toFixed(5)}</dd>
        <dt>Coordinate uncertainty</dt><dd className="mono" data-source="LIVE">{rec.uncertaintyM !== null ? `± ${fmtExact(Math.round(rec.uncertaintyM))} m` : "not stated"}</dd>
        {rec.country && (<><dt>Country</dt><dd>{countryName(rec.country)}</dd></>)}
        {rec.locality && (<><dt>Locality</dt><dd>{rec.locality}</dd></>)}
        {rec.recordedBy && (<><dt>Recorded by</dt><dd>{rec.recordedBy}</dd></>)}
        {rec.dataset && (<><dt>Dataset</dt><dd>{rec.dataset}</dd></>)}
        <dt>Record licence</dt><dd>{rec.licence ?? "unknown"}</dd>
      </dl>
      <div className="actions">
        {ours.state === "ok" && ours.value ? (
          <button className="btn primary" onClick={() => void selectSpecies(ours.value!, { fly: false })}>Open species</button>
        ) : (
          <button className="btn" disabled title={`Species files exist only for species with at least ${m.constants.MIN_SPECIES_RECORDS} snapshot records`}>Open species</button>
        )}
        <a className="btn" href={`https://www.gbif.org/occurrence/${rec.key}`} target="_blank" rel="noreferrer">View on GBIF <Icon name="external" /></a>
      </div>
      {iucnNote(rec.iucn)}
    </PanelFrame>
  );
}

function iucnNote(code: string | null) {
  if (!code) return <p className="caption muted">No IUCN category on this record.</p>;
  return <p className="caption muted">IUCN category {iucnLabel(code)} is as carried on the GBIF record; it describes the species, not this observation.</p>;
}

/** Local level: what GBIF holds for the current view (live facets), separate from snapshot figures. */
export function ViewPanel() {
  const live = useStore((s) => s.live);
  const m = useStore((s) => s.manifest);
  const group = useStore((s) => s.group);
  const bin = useStore((s) => s.bin);
  const species = useStore((s) => s.species);
  const set = useStore((s) => s.set);
  const bbox = live.bbox;
  const facets = useAsync<ViewFacets | null>(async () => {
    if (!bbox || !m) return null;
    const taxonKey = species ? await matchSpecies(species.canonicalName, species.taxonomy.class) : null;
    return fetchViewFacets({ bbox, group, bin, bins: m.bins, taxonKey });
  }, [JSON.stringify(bbox), group, bin, species?.speciesKey]);
  if (!m) return null;
  const f = facets.state === "ok" ? facets.value : null;
  return (
    <PanelFrame
      tall
      live
      onClose={() => set({ panel: "none" })}
      title={
        <>
          <div className="eyebrow">Live GBIF records in view · {bin === "all" ? "all years" : m.bins.find((b) => b.id === bin)?.label}</div>
          <h2 className="plain">Records in this view</h2>
        </>
      }
    >
      {facets.state === "loading" && <p className="small muted">Asking GBIF…</p>}
      {facets.state === "error" && <p className="small">GBIF did not answer. The globe still works; try again in a moment.</p>}
      {f && (
        <>
          <div className="stats">
            <div><span className="stat"><Num value={f.count} source="LIVE" /></span><span className="label">records in view</span></div>
            <div><span className="stat"><Num value={live.result?.records.length ?? 0} source="LIVE" /></span><span className="label">shown on the map</span></div>
          </div>
          <FacetList title="Most recorded species here" facets={f.species} kind="species" />
          {f.iucn.length > 0 && (
            <>
              <h3>Records by IUCN category of the species</h3>
              <ul className="share-bars plain">
                {f.iucn.map((x) => (
                  <li key={x.name}><span className="sb-label">{iucnLabel(x.name)} ({x.name})</span><span className="sb-num mono">{fmtExact(x.count)}</span></li>
                ))}
              </ul>
            </>
          )}
          <FacetList title="Records by class" facets={f.classes} kind="class" />
          <p className="caption muted">
            Counts are from GBIF's live index today, with the same licence, presence, coordinate and basis filters as the snapshot, and
            coordinate uncertainty unknown or at most 10 km.{f.overMaxUncertainty > 0 && ` The breakdowns below still include ${fmtExact(f.overMaxUncertainty)} records that state more than 10 km.`} They differ from snapshot figures and are not numbers of animals.
          </p>
        </>
      )}
    </PanelFrame>
  );
}

function FacetList({ title, facets, kind }: { title: string; facets: Facet[]; kind: "species" | "class" }) {
  if (!facets.length) return null;
  return (
    <>
      <h3>{title}</h3>
      <ol className="ranked">
        {facets.map((x) => (
          <li key={x.name}><FacetName k={Number(x.name)} italic={kind === "species"} /><Num value={x.count} source="LIVE" exact /></li>
        ))}
      </ol>
    </>
  );
}

function FacetName({ k, italic }: { k: number; italic: boolean }) {
  const n = useAsync(() => taxonName(k), [k]);
  if (n.state !== "ok") return <span className="nm muted">…</span>;
  return (
    <span className="nm">
      <span className={italic ? "sci" : undefined}>{n.value.name}</span>
      {n.value.vernacular && <span className="muted small"> · {n.value.vernacular}</span>}
    </span>
  );
}
