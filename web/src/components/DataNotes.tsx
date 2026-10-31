import { useEffect, useRef } from "react";
import { useStore } from "../state/store";
import { Icon } from "./Icon";
import { Num } from "./Num";

const BASIS_LABEL: Record<string, string> = {
  FOSSIL_SPECIMEN: "Fossil specimens",
  LIVING_SPECIMEN: "Living specimens (zoos, botanic gardens)",
  MATERIAL_SAMPLE: "Material samples (e.g. eDNA)",
  MATERIAL_CITATION: "Material citations",
  OCCURRENCE: "Basis not stated",
  None: "Basis missing",
};

/** Cross-screen Data notes drawer. Every number here is read from the manifest (A-01). */
export function DataNotes() {
  const m = useStore((s) => s.manifest);
  const open = useStore((s) => s.notesOpen);
  const set = useStore((s) => s.set);
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) closeBtn.current?.focus();
  }, [open]);
  if (!open || !m) return null;
  const f = m.filters;
  const close = () => set({ notesOpen: false });
  return (
    <aside className="drawer glass" role="dialog" aria-modal="false" aria-label="Data notes" onKeyDown={(e) => e.key === "Escape" && close()}>
      <button ref={closeBtn} className="icon-btn close" aria-label="Close data notes" onClick={close}>
        <Icon name="close" />
      </button>
      <h2>Data notes</h2>

      <h3>Snapshot</h3>
      <p>
        GBIF occurrence snapshot <span className="mono">{m.snapshot.id}</span> from the Registry of Open Data on AWS
        (<span className="mono">{m.snapshot.source}</span>), retrieved <span className="mono">{m.retrievedAt}</span>.
        Dataset id <span className="mono">{m.datasetId}</span>. <a href={m.snapshot.registryUrl} target="_blank" rel="noreferrer">Registry entry</a>.
      </p>
      {m.build.kind !== "full" && (
        <p style={{ color: "var(--warn)" }}>
          This is a {m.build.kind} build: it read <Num value={m.build.partsRead} source="A-01" exact /> of{" "}
          <Num value={m.build.partsTotal} source="A-01" exact /> Parquet parts of the snapshot
          {m.build.sampleEvery > 1 && <> (every {m.build.sampleEvery}th part)</>}
          {m.build.country && <>, country {m.build.country}</>}. Counts cover only those parts and are not global totals.
        </p>
      )}

      <h3>Filters applied (records removed at each stage)</h3>
      <table>
        <tbody>
          <tr><td>Rows read</td><td className="n"><Num value={f.rowsRead} source="A-01" exact /></td></tr>
          {f.stages.map((s) => (
            <tr key={s.id}><td><span className="mono">{s.id}</span> {s.rule}</td><td className="n"><Num value={s.dropped} source="A-01" exact /></td></tr>
          ))}
          <tr><td><strong>Kept (Animals lens)</strong></td><td className="n"><strong><Num value={f.kept} source="A-01" exact /></strong></td></tr>
          <tr><td>Kept with no stated coordinate uncertainty</td><td className="n"><Num value={f.keptWithNullUncertainty} source="A-01" exact /></td></tr>
        </tbody>
      </table>
      {Object.keys(f.basisDropped).length > 0 && (
        <>
          <p className="small">Removed at F4 by basis of record:</p>
          <table>
            <tbody>
              {Object.entries(f.basisDropped).map(([k, n]) => (
                <tr key={k}><td>{BASIS_LABEL[k] ?? k}</td><td className="n"><Num value={n} source="A-01" exact /></td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="small">Not applied in this build: {f.notApplied.join("; ")}.</p>

      <h3>Groups and lenses</h3>
      <p className="small">
        Animals groups follow GBIF Backbone classes (groups version {m.lenses.animals.groupsVersion}). Fishes (grouped) is a functional grouping, not a clade.
        {" "}{m.lenses.trees.reason}
      </p>
      <p className="small">
        Species files exist for <Num value={m.species.count} source="A-01" exact /> species with at least{" "}
        <Num value={m.constants.MIN_SPECIES_RECORDS} source="A-01" exact /> kept records. Effort is the number of kept records of the active lens and group in a cell and bin; cells with
        effort under <Num value={m.constants.MIN_EFFORT} source="A-01" exact /> are hatched in effort-normalised mode. Names: {m.species.namesSource}.
      </p>

      <h3>Known biases</h3>
      <ol>
        <li>Observer bias: records follow people and projects, not animals. The densest cells are often where observers live.</li>
        <li>Taxonomic bias: birds and well-known species are over-represented; many insects are under-recorded.</li>
        <li>Time bias: record volume rises strongly in recent decades, so compare bins with the effort strip or in effort-normalised mode (which reduces but does not remove bias).</li>
        <li>The last bin (2020 onwards) is partial, and data publishing lags.</li>
        <li>Coordinate precision varies; the uncertainty filter reduces but does not remove errors.</li>
        <li>Taxonomy follows the GBIF Backbone at this snapshot; names change.</li>
        <li>Marine and polar records are sparse.</li>
        <li>The licence filter removes CC BY-NC records, which shifts coverage for some taxa and countries.</li>
        <li>There are no absence data: a cell without records says nothing about whether a species is present.</li>
      </ol>

      <h3>What this build does not show</h3>
      <p className="small">
        Estimated geographic extents of species, numbers of individuals or their trends, seasonal or migration patterns, conservation classifications (IUCN), life cycles, and forest cover.
        The camera fit for a species uses the central 98% of its recorded positions; it is a viewing aid only.
      </p>

      <h3>Licences and attribution</h3>
      <ul>
        {m.attribution.map((a) => <li key={a}>{a}</li>)}
        <li>Basemap and place search: Amazon Location Service (provider terms apply). Fallback imagery: Natural Earth II, bundled with CesiumJS.</li>
        <li>CesiumJS (Apache-2.0), React (MIT), h3-js (Apache-2.0), Fraunces, Inter and JetBrains Mono (SIL OFL).</li>
        <li>Derived aggregate files: CC BY 4.0. Code: MIT.</li>
      </ul>
      {m.snapshot.citation && (
        <>
          <h3>Citation</h3>
          <p className="small mono" style={{ whiteSpace: "pre-wrap" }}>{m.snapshot.citation}</p>
        </>
      )}
      <h3>Build</h3>
      <p className="caption mono">
        schema v{m.schemaVersion} · {Object.entries(m.build.tools).map(([k, v]) => `${k} ${v}`).join(" · ")} · resolutions {m.build.resolutions.join(", ")}
      </p>
    </aside>
  );
}
