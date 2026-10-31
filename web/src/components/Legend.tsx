import { useState } from "react";
import { fmtCount, fmtShare } from "../data/format";
import type { Layer } from "../globe/layerModel";
import { RAMPS } from "../globe/ramps";
import { GROUP_COLORS } from "../globe/Globe";
import { useStore } from "../state/store";
import { Icon } from "./Icon";

export function Legend({ layer, loading }: { layer: Layer | null; loading: boolean }) {
  const [open, setOpen] = useState(() => window.innerHeight > 760); // short screens: start collapsed so it never covers the group rail
  const lens = useStore((s) => s.lens);
  const manifest = useStore((s) => s.manifest);
  const species = useStore((s) => s.species);
  const lod = useStore((s) => s.lod);
  const mode = useStore((s) => s.mode);
  const set = useStore((s) => s.set);
  const ramp = RAMPS[lens];
  const built = manifest?.lenses[lens].built;
  const fmt = (v: number) => (layer?.isShare ? fmtShare(v) : fmtCount(v));

  const caption = !layer
    ? ""
    : layer.kind === "species-effort"
      ? "Colour shows effort: all recorded occurrences of the active lens and group, not abundance."
      : layer.isShare
        ? "Colour shows share of records (species or group records ÷ effort), not abundance."
        : "Colour shows recorded occurrences, not abundance.";

  return (
    <section className="legend glass" aria-label="Legend">
      <div className="row">
        <strong className="small">Legend</strong>
        <button className="icon-btn" aria-expanded={open} aria-label={open ? "Collapse legend" : "Expand legend"} onClick={() => setOpen(!open)}>
          <Icon name={open ? "collapse" : "expand"} />
        </button>
      </div>
      {!built && manifest && (
        <p className="notice">{manifest.lenses.trees.reason}</p>
      )}
      {built && layer && (
        <>
          <div className="caption">{caption}</div>
          {open && (
            <div className="details">
              {layer.empty ? (
                <p className="notice">No records in this bin for this selection. Fewer observers may have contributed data for these years. Try another bin or All years.</p>
              ) : (
                <>
                  <div className="ramp" aria-hidden="true">
                    {ramp.map((c) => <span key={c} style={{ background: c }} />)}
                  </div>
                  <div className="ticks mono" data-source="A-02">
                    {layer.breaks.length >= 7 ? (
                      <>
                        <span>{fmt(layer.breaks[0])}</span>
                        <span style={{ textAlign: "center" }}>{fmt(layer.breaks[3])}</span>
                        <span style={{ textAlign: "right" }}>{fmt(layer.breaks[6])}+</span>
                      </>
                    ) : (
                      <span>from {fmt(layer.breaks[0] ?? 0)}</span>
                    )}
                  </div>
                  <div className="caption muted">Log scale, 7 classes; labels are the lower bounds of classes 1, 4 and 7{species && mode !== "effort" ? "; scale is relative to this species' records" : ""}.</div>
                </>
              )}
              {layer.isShare && (
                <div className="row" style={{ marginTop: 8 }}>
                  <span><span className="hatch" style={{ display: "inline-block", verticalAlign: "middle", marginRight: 6 }} />Insufficient effort (&lt; {manifest?.constants.MIN_EFFORT} records)</span>
                </div>
              )}
              {lod === 2 && (
                <div className="record-key">
                  <div className="caption">Small orange dots: all matching GBIF records (denser = redder). Larger points: clickable records, by group</div>
                  <ul>
                    {(manifest?.lenses.animals.groups ?? []).filter((g) => g.id !== "all").map((g) => (
                      <li key={g.id}><span className="dot" style={{ background: GROUP_COLORS[g.id] }} />{g.label}</li>
                    ))}
                  </ul>
                  <div className="caption muted">Numbered circles are clusters of nearby records; click to zoom in.</div>
                </div>
              )}
              {species && (
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="toggle" aria-pressed={mode === "effort"} onClick={() => set({ mode: mode === "effort" ? "density" : "effort" })}>
                    <span className="box" /> Show effort instead of species records
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {loading && <div className="caption muted">Loading layer…</div>}
    </section>
  );
}
