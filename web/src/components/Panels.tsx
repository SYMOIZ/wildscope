import type { Layer } from "../globe/layerModel";
import { flyToSpecies } from "../state/actions";
import { useStore } from "../state/store";
import { Icon } from "./Icon";
import { Num } from "./Num";
import { shareView } from "./share";

const LANG: Record<string, string> = { eng: "en", fra: "fr", spa: "es", deu: "de", por: "pt", nld: "nl", ita: "it", swe: "sv", dan: "da", nor: "no", fin: "fi", jpn: "ja", zho: "zh", rus: "ru" };

function countryName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function Provenance() {
  const m = useStore((s) => s.manifest);
  const set = useStore((s) => s.set);
  if (!m) return null;
  return (
    <div className="provenance caption">
      GBIF snapshot {m.snapshot.id} · CC0/CC BY · n=<Num value={m.filters.kept} source="A-01" />
      {m.build.kind !== "full" && <> · {m.build.kind} build</>} · <button onClick={() => set({ notesOpen: true })}>Data notes</button>
    </div>
  );
}

function PanelFrame({ title, children, onClose, tall }: { title: React.ReactNode; children: React.ReactNode; onClose: () => void; tall?: boolean }) {
  return (
    <aside className={`panel glass${tall ? " tall" : ""}`} aria-label="Context panel">
      <header>
        <div className="title">{title}</div>
        <button className="icon-btn" aria-label="Close panel" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <div className="body">{children}</div>
      <footer><Provenance /></footer>
    </aside>
  );
}

/** S05 Species detail (contest cut: no media, no conservation chip, no life cycle). */
export function SpeciesPanel() {
  const sp = useStore((s) => s.species);
  const m = useStore((s) => s.manifest);
  const set = useStore((s) => s.set);
  if (!sp || !m) return null;
  const r = sp.records;
  const groupLabel = m.lenses[sp.lens].groups?.find((g) => g.id === sp.group)?.label ?? sp.group;
  const lic = r.licence;
  const licTotal = (lic.CC0_1_0 ?? 0) + (lic.CC_BY_4_0 ?? 0);
  const pct = (n: number) => (licTotal ? Math.round((n / licTotal) * 100) : 0);
  const shown = sp.vernacularNames.slice(0, 3);
  const more = sp.vernacularNamesTotal - shown.length;
  const authorship = sp.scientificName !== sp.canonicalName ? sp.scientificName.slice(sp.canonicalName.length).trim() : "";

  return (
    <PanelFrame
      tall
      onClose={() => set({ panel: "none" })}
      title={
        <>
          <h2>{sp.canonicalName}</h2>
          <div className="small muted">
            {authorship && <span>{authorship} · </span>}
            {sp.rank ? sp.rank.toLowerCase() : "species"}
            {sp.taxonomicStatus && <> · {sp.taxonomicStatus.toLowerCase().replace(/_/g, " ")} name (Catalogue of Life)</>}
          </div>
          {shown.length > 0 && (
            <div className="small" style={{ marginTop: 6 }}>
              {shown.map((v, i) => (
                <span key={i}>{i > 0 && " · "}{v.name}{v.lang && <span className="muted caption"> {LANG[v.lang] ?? v.lang}</span>}</span>
              ))}
              {more > 0 && <span className="muted"> · +{more} more</span>}
            </div>
          )}
        </>
      }
    >
      <div className="placeholder" aria-hidden="true">{(sp.taxonomy.genus ?? sp.canonicalName)[0]}</div>
      <div>
        <span className="chip">{groupLabel}</span>
        {sp.sensitive && <span className="chip warn">Location generalised</span>}
      </div>

      <h3>Records</h3>
      <dl>
        <dt>Recorded occurrences</dt><dd><Num value={r.total} source="A-03" exact /></dd>
        <dt>Earliest record in snapshot</dt><dd className="mono" data-source="A-03">{r.earliestYear}</dd>
        <dt>Latest record in snapshot</dt><dd className="mono" data-source="A-03">{r.latestYear}</dd>
        <dt>Licence mix</dt>
        <dd className="mono" data-source="A-03">CC0 {pct(lic.CC0_1_0 ?? 0)}% · CC BY {pct(lic.CC_BY_4_0 ?? 0)}%</dd>
        <dt>Cells with records (res 4)</dt><dd><Num value={sp.cells.cells.length} source="A-03" exact /></dd>
      </dl>
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

      <h3>Conservation classification</h3>
      <p className="small muted">Not in the IUCN data used. This build does not include IUCN categories.</p>

      <div className="actions">
        <button className="btn" onClick={() => flyToSpecies(sp)}>Show on globe</button>
        <button className="btn" onClick={() => document.querySelector<HTMLButtonElement>(".timeline .tick[tabindex='0']")?.focus()}>Timeline</button>
        <button className="btn" disabled title="No reviewed life-cycle record yet">Life cycle</button>
        <button className="btn" onClick={shareView}>Share view</button>
      </div>
      <p className="caption muted">No reviewed life-cycle record yet for this species.</p>

      <h3>Taxonomy (GBIF taxonomy of the snapshot)</h3>
      <ul className="taxonomy">
        {(["kingdom", "phylum", "class", "order", "family", "genus"] as const).map((rank) =>
          sp.taxonomy[rank] ? (
            <li key={rank}><span className="muted">{rank}</span><span>{sp.taxonomy[rank]}</span></li>
          ) : null,
        )}
        <li><span className="muted">species</span><span className="sci">{sp.canonicalName}</span></li>
      </ul>
      <p className="small">
        <a href={sp.taxonUrl} target="_blank" rel="noreferrer">Catalogue of Life taxon page <Icon name="external" /></a>
      </p>
    </PanelFrame>
  );
}

/** Cell card: totals and effort for the selected cell from A-02 (the species list needs region files, not in this build). */
export function CellPanel({ layer }: { layer: Layer | null }) {
  const sel = useStore((s) => s.selectedCell);
  const m = useStore((s) => s.manifest);
  const bin = useStore((s) => s.bin);
  const pin = useStore((s) => s.pin);
  const species = useStore((s) => s.species);
  const set = useStore((s) => s.set);
  if (!sel || !m) return null;
  const c = layer?.info.get(sel.id);
  const binLabel = bin === "all" ? "All years" : m.bins.find((b) => b.id === bin)?.label;
  return (
    <PanelFrame
      onClose={() => set({ panel: species ? "species" : "none", selectedCell: null })}
      title={<h2 className="plain">{pin ? pin.label : `Cell ${sel.id.slice(0, 7)}…`}</h2>}
    >
      <p className="small muted">H3 cell <span className="mono">{sel.id}</span> at resolution {sel.res}.</p>
      {c ? (
        <dl>
          <dt>{species && layer?.kind !== "species-effort" ? `Records of ${species.canonicalName}` : "Recorded occurrences"} in {binLabel}</dt>
          <dd><Num value={c.records} source={species ? "A-03" : "A-02"} exact /></dd>
          {c.effort !== null && (<><dt>Effort (active lens and group)</dt><dd><Num value={c.effort} source="A-02" exact /></dd></>)}
        </dl>
      ) : (
        <p className="small">No records in this cell for {binLabel} in the current selection. A cell without records says nothing about whether animals live there.</p>
      )}
      <p className="caption muted">The ranked species list for a cell needs region files, which are not part of this build.</p>
    </PanelFrame>
  );
}
