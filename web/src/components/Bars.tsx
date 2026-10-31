import { fmtCount, fmtExact } from "../data/format";
import type { SourceId } from "./Num";

interface Props {
  values: number[];
  labels: string[];
  source: SourceId;
  highlight?: number; // index of the selected bin
  partial?: number; // index of a partial bin (striped)
  log?: boolean;
  unit?: string;
}

/** Small vertical bar chart; every bar has its exact value as text for screen readers and on hover. */
export function Bars({ values, labels, source, highlight, partial, log = true, unit = "records" }: Props) {
  const scale = (v: number) => (log ? Math.log10(v + 1) : v);
  const max = Math.max(1, ...values.map(scale));
  return (
    <div className="bars-chart" role="img" aria-label={labels.map((l, i) => `${l}: ${fmtExact(values[i])} ${unit}`).join("; ")} data-source={source}>
      {values.map((v, i) => (
        <div key={labels[i]} className={`bc-col${highlight === i ? " on" : ""}${partial === i ? " partial" : ""}`} title={`${labels[i]}: ${fmtExact(v)} ${unit} (source ${source})`}>
          <span className="bc-val mono">{v ? fmtCount(v) : "0"}</span>
          <span className="bc-bar" style={{ height: `${v ? Math.max(3, (scale(v) / max) * 100) : 0}%` }} />
          <span className="bc-lab mono">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

/** Horizontal share bars for categories (e.g. records by group). */
export function ShareBars({ items, source, colors }: { items: { label: string; value: number; key: string }[]; source: SourceId; colors?: Record<string, string> }) {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  return (
    <ul className="share-bars" data-source={source}>
      {items.map((it) => (
        <li key={it.key} title={`${it.label}: ${fmtExact(it.value)} (source ${source})`}>
          <span className="sb-label">{it.label}</span>
          <span className="sb-track"><span className="sb-fill" style={{ width: `${(it.value / total) * 100}%`, background: colors?.[it.key] }} /></span>
          <span className="sb-num mono">{fmtCount(it.value)}</span>
        </li>
      ))}
    </ul>
  );
}
