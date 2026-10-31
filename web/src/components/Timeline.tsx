import { useEffect, useMemo, useRef, useState } from "react";
import { PLAY_DWELL_MS } from "../config/interaction";
import { fmtExact } from "../data/format";
import type { BinId } from "../data/types";
import { normalisedAvailability } from "../globe/layerModel";
import { useStore } from "../state/store";
import { Icon } from "./Icon";

/** S06: nine bins, effort strip (log height), Play, All years, effort-normalised toggle. */
export function Timeline({ effortByBin }: { effortByBin: number[] }) {
  const manifest = useStore((s) => s.manifest);
  const bin = useStore((s) => s.bin);
  const normalised = useStore((s) => s.normalised);
  const species = useStore((s) => s.species);
  const group = useStore((s) => s.group);
  const lens = useStore((s) => s.lens);
  const set = useStore((s) => s.set);
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const playBtn = useRef<HTMLButtonElement>(null);
  const bins = useMemo(() => manifest?.bins ?? [], [manifest]);

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => {
      const i = bin === "all" ? -1 : bins.findIndex((b) => b.id === bin);
      if (i >= bins.length - 1) {
        setPlaying(false);
        playBtn.current?.focus();
      } else {
        set({ bin: bins[i + 1].id });
      }
    }, bin === "all" ? 0 : PLAY_DWELL_MS);
    return () => window.clearTimeout(t);
  }, [playing, bin, bins, set]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "e" || e.key === "E") setExpanded((x) => !x);
      if (e.key === "Escape") setPlaying(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!manifest || !manifest.lenses[lens].built) {
    return <div className="timeline"><div /><div className="note">Timeline needs data for this lens.</div><div /></div>;
  }
  const maxLog = Math.log10(Math.max(1, ...effortByBin) + 1);
  const spBins = species?.records.byBin ?? null;
  const spMax = spBins ? Math.log10(Math.max(1, ...spBins) + 1) : 1;
  const norm = normalisedAvailability(group, species);
  const groupLabel = manifest.lenses[lens].groups?.find((g) => g.id === group)?.label ?? group;

  const onScrubKey = (e: React.KeyboardEvent) => {
    const i = bin === "all" ? -1 : bins.findIndex((b) => b.id === bin);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = Math.min(bins.length - 1, i + 1);
    else if (e.key === "ArrowLeft") next = Math.max(0, i - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = bins.length - 1;
    else if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); return; }
    if (next !== null) { e.preventDefault(); set({ bin: bins[next].id }); }
  };

  // SI-03: a fall in records between bins is "fewer records", always next to the effort series.
  let note = "Bars: grey = effort (all records of the active lens and group); colour = selected species. Heights are log-scaled.";
  if (species && bin !== "all") {
    const i = bins.findIndex((b) => b.id === bin);
    if (i > 0 && spBins && spBins[i] < spBins[i - 1]) {
      note = `Fewer records of this species in ${bins[i].label} (${fmtExact(spBins[i])}) than in ${bins[i - 1].label} (${fmtExact(spBins[i - 1])}). Effort for ${groupLabel} went from ${fmtExact(effortByBin[i - 1])} to ${fmtExact(effortByBin[i])} records. Fewer records do not show fewer animals.`;
    }
  }

  return (
    <section className={`timeline${expanded ? " expanded" : ""}`} aria-label="Timeline">
      <button ref={playBtn} className="play" aria-label={playing ? "Pause" : "Play through the bins"} onClick={() => {
        if (!playing && (bin === "all" || bin === bins[bins.length - 1].id)) set({ bin: bins[0].id });
        setPlaying(!playing);
      }}>
        <Icon name={playing ? "pause" : "play"} />
      </button>
      <div>
        <div className="bins" role="radiogroup" aria-label="Time bin" onKeyDown={onScrubKey}>
          {bins.map((b, i) => {
            const eff = effortByBin[i] ?? 0;
            const h = eff ? Math.max(4, (Math.log10(eff + 1) / maxLog) * 100) : 0;
            const sh = spBins && spBins[i] ? Math.max(4, (Math.log10(spBins[i] + 1) / spMax) * 100) : 0;
            const selected = bin === b.id;
            const empty = spBins ? spBins[i] === 0 : eff === 0;
            return (
              <div key={b.id} className={`bin${b.to === null ? " partial" : ""}`}>
                <div className="bars" aria-hidden="true">
                  <span className="effort" style={{ height: `${h}%` }} title={`Effort ${b.label}: ${fmtExact(eff)} records (source A-01)`} data-source="A-01" />
                  {spBins && <span className="sp" style={{ height: `${sh}%` }} title={`Species ${b.label}: ${fmtExact(spBins[i])} records (source A-03)`} data-source="A-03" />}
                </div>
                <button
                  className={`tick${empty ? " empty" : ""}`}
                  role="radio"
                  aria-checked={selected}
                  aria-pressed={selected}
                  tabIndex={selected || (bin === "all" && i === 0) ? 0 : -1}
                  title={`${b.label}${b.to === null ? ": partial bin; data publishing lags" : ""}${empty ? " · No records in this bin" : ""}`}
                  onClick={() => set({ bin: b.id as BinId })}
                >
                  {b.tick}
                </button>
              </div>
            );
          })}
        </div>
        <div className="strip-label">
          <span><span className="swatch" style={{ background: "var(--bone-500)" }} />Effort ({groupLabel})</span>
          {species && <span><span className="swatch" style={{ background: "var(--lens-5)" }} />{species.canonicalName}</span>}
          <span>Selected: <span className="mono">{bin === "all" ? "All years" : bins.find((b) => b.id === bin)?.label}</span></span>
        </div>
        {expanded && <div className="note" role="note">{note}</div>}
      </div>
      <div className="side">
        <button className="btn all" aria-pressed={bin === "all"} onClick={() => { setPlaying(false); set({ bin: "all" }); }}>All years</button>
        <button
          className="toggle"
          aria-pressed={normalised && norm.ok}
          disabled={!norm.ok}
          title={norm.ok ? "Cell value = records ÷ effort; cells under the effort minimum are hatched" : norm.reason}
          onClick={() => set({ normalised: !normalised })}
        >
          <span className="box" /> Effort-normalised
        </button>
        <button className="icon-btn" aria-label={expanded ? "Collapse timeline" : "Expand timeline"} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          <Icon name={expanded ? "collapse" : "expand"} />
        </button>
      </div>
    </section>
  );
}
